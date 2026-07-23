/**
 * 백업 내보내기 / 불러오기.
 *
 * 순수 부분(객체 생성·직렬화·파싱·파일명)과 브라우저 부분(다운로드·파일 읽기)을 나눠
 * 순수 부분은 화면 없이 테스트한다. 개인 백업과 요건 세트 공유(개인 데이터 미포함)를 구분한다.
 */

import type { RequirementSet } from '../engine/index'
import {
  APP_ID,
  SCHEMA_VERSION,
  defaultSettings,
  parseJson,
  previewPersonal,
  previewShare,
  validatePersonalBackup,
  validateReqsetShare,
  type PersistedState,
  type PersonalBackup,
  type PersonalPreview,
  type ReqsetShare,
  type SharePreview,
  type ValidateResult,
} from './schema'

// ────────────────────────────────────────────────────────────
// 생성 (순수)
// ────────────────────────────────────────────────────────────

/** 개인 전체 백업 객체 생성. */
export function buildPersonalBackup(state: PersistedState, exportedAt: string): PersonalBackup {
  return {
    app: APP_ID,
    type: 'ajou-grad-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    profile: state.profile,
    courses: state.courses,
    noncurricular: state.noncurricular,
    customSets: state.customSets,
    settings: state.settings,
  }
}

/**
 * 요건 세트 공유 파일 생성. **개인 데이터를 절대 담지 않는다** — 인자로 세트만 받는다.
 * source에 개인 식별 정보가 섞여 있을 수 있어 화이트리스트로 세트 필드만 옮긴다.
 */
export function buildReqsetShare(sets: RequirementSet[], exportedAt: string): ReqsetShare {
  return {
    app: APP_ID,
    type: 'ajou-grad-reqset',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    requirementSets: sets.map(sanitizeReqSet),
  }
}

/**
 * 공유 세트를 요건 정의 필드만 담은 새 객체로 다시 만든다(화이트리스트).
 * author·source·createdAt·updatedAt 등 개인 흔적이 될 수 있는 필드는 옮기지 않는다 —
 * 블랙리스트로 특정 필드만 지우면 새 필드가 그대로 새므로 "옮길 것만 옮기는" 방식으로 둔다.
 * (undefined 필드는 JSON.stringify에서 자동 생략된다.)
 */
function sanitizeReqSet(set: RequirementSet): RequirementSet {
  return {
    schemaVersion: set.schemaVersion,
    requirementVersion: set.requirementVersion,
    id: set.id,
    name: set.name,
    admissionYearFrom: set.admissionYearFrom,
    admissionYearTo: set.admissionYearTo,
    college: set.college,
    department: set.department,
    trackType: set.trackType,
    totalCredits: set.totalCredits,
    minGPA: set.minGPA,
    gradePoints: set.gradePoints,
    buckets: set.buckets,
    nonCurricular: set.nonCurricular,
    equivalents: set.equivalents,
    courseGroups: set.courseGroups,
    recognitionCaps: set.recognitionCaps,
    majorPolicy: set.majorPolicy,
  }
}

export function serialize(file: PersonalBackup | ReqsetShare): string {
  return JSON.stringify(file, null, 2)
}

/** 파일명 — 개인: ajou-grad-{학번}-{YYYYMMDD}.json / 공유: ajou-grad-reqset-{YYYYMMDD}.json */
export function backupFilename(
  type: 'ajou-grad-backup' | 'ajou-grad-reqset',
  admissionYear: number | null,
  date: Date,
): string {
  const ymd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  if (type === 'ajou-grad-reqset') return `ajou-grad-reqset-${ymd}.json`
  const who = admissionYear != null ? String(admissionYear) : 'backup'
  return `ajou-grad-${who}-${ymd}.json`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// ────────────────────────────────────────────────────────────
// 파싱 / 검증 (순수) — 미리보기까지
// ────────────────────────────────────────────────────────────

export function parsePersonalBackup(
  text: string,
): ValidateResult<{ backup: PersonalBackup; preview: PersonalPreview }> {
  const json = parseJson(text)
  if (!json.ok) return json
  const res = validatePersonalBackup(json.value)
  if (!res.ok) return res
  return { ok: true, value: { backup: res.value, preview: previewPersonal(res.value) } }
}

export function parseReqsetShare(
  text: string,
): ValidateResult<{ share: ReqsetShare; preview: SharePreview }> {
  const json = parseJson(text)
  if (!json.ok) return json
  const res = validateReqsetShare(json.value)
  if (!res.ok) return res
  return { ok: true, value: { share: res.value, preview: previewShare(res.value) } }
}

/** 개인 백업 → 앱 상태로 환원. 구버전 백업에 없는 설정 필드는 기본값으로 채운다. */
export function backupToState(b: PersonalBackup): PersistedState {
  return {
    profile: b.profile,
    courses: b.courses,
    noncurricular: b.noncurricular,
    customSets: b.customSets,
    settings: { ...defaultSettings(), ...b.settings },
  }
}

// ────────────────────────────────────────────────────────────
// 브라우저 I/O (얇은 래퍼 — DOM 필요)
// ────────────────────────────────────────────────────────────

/** JSON 문자열을 파일로 내려받게 한다. */
export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 다음 틱에 해제(즉시 revoke하면 일부 브라우저가 다운로드를 취소).
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** 선택한 파일을 텍스트로 읽는다. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했어요.'))
    reader.readAsText(file)
  })
}
