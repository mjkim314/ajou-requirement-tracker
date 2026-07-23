/**
 * 저장 스키마 · 백업 파일 형식 · 검증 · 마이그레이션 (순수).
 *
 * localStorage를 직접 만지지 않는다(그건 adapter.ts). 여기서는 타입·상수·
 * 순수 검증/마이그레이션 함수만 둔다 → 화면 없이 테스트 가능.
 */

import type {
  Course,
  NonCurricularState,
  Profile,
  RequirementSet,
} from '../engine/index'

/** 저장 키 네임스페이스(같은 오리진 충돌 방지). 논리 키 이름은 CLAUDE.md를 따른다. */
export const STORAGE_NS = 'ajou-grad'
export const APP_ID = 'ajou-grad-tracker'

/** 저장 레이아웃·백업 파일 형식 버전. 올라가면 마이그레이션을 추가한다. */
export const SCHEMA_VERSION = 1

export type StorageKey =
  | 'profile'
  | 'courses'
  | 'noncurricular'
  | 'reqsets:custom'
  | 'settings'

export const STORAGE_KEYS: StorageKey[] = [
  'profile',
  'courses',
  'noncurricular',
  'reqsets:custom',
  'settings',
]

/** 표시 옵션·마지막 백업 시각·백업 리마인더 상태 등. */
export interface Settings {
  /** 마지막으로 개인 백업을 받은 시각(ISO). 없으면 null. */
  lastBackupAt: string | null
  /** 백업 리마인더 배너를 마지막으로 닫은 시각(ISO). 이후 7일간 일반 배너 숨김. */
  bannerDismissedAt: string | null
  /** 마지막 백업 시점의 과목 수. 이후 추가분(+N)을 세어 "10건 이상 추가" 리마인더에 쓴다. */
  courseCountAtLastBackup: number | null
  /** 학기말 1회 강조 배너를 이미 처리한 학기 식별자('2026-1'·'2026-2'). 학기당 1회만 강조. */
  semesterNudgeShownFor: string | null
}

export function defaultSettings(): Settings {
  return {
    lastBackupAt: null,
    bannerDismissedAt: null,
    courseCountAtLastBackup: null,
    semesterNudgeShownFor: null,
  }
}

/** 앱이 다루는 개인 데이터 전체(비영속 파생값 제외). */
export interface PersistedState {
  profile: Profile | null
  courses: Course[]
  noncurricular: NonCurricularState
  customSets: RequirementSet[]
  settings: Settings
}

export function emptyPersistedState(): PersistedState {
  return {
    profile: null,
    courses: [],
    noncurricular: {},
    customSets: [],
    settings: defaultSettings(),
  }
}

/** 저장 덩어리 봉투 — CLAUDE.md: 각 키는 updatedAt을 포함한다(지금 안 써도 반드시). */
export interface Envelope<T> {
  /** 이 덩어리의 스키마 버전. */
  v: number
  updatedAt: string
  value: T
}

// ────────────────────────────────────────────────────────────
// 백업 파일 형식
// ────────────────────────────────────────────────────────────

export type BackupType = 'ajou-grad-backup' | 'ajou-grad-reqset'

/** 개인 전체 백업 — 프로필·과목·비교과·커스텀 세트·설정. */
export interface PersonalBackup {
  app: typeof APP_ID
  type: 'ajou-grad-backup'
  schemaVersion: number
  exportedAt: string
  profile: Profile | null
  courses: Course[]
  noncurricular: NonCurricularState
  customSets: RequirementSet[]
  settings: Settings
}

/** 요건 세트만 담는 공유 파일 — 개인 데이터 절대 미포함. */
export interface ReqsetShare {
  app: typeof APP_ID
  type: 'ajou-grad-reqset'
  schemaVersion: number
  exportedAt: string
  requirementSets: RequirementSet[]
}

export type BackupFile = PersonalBackup | ReqsetShare

// ────────────────────────────────────────────────────────────
// 검증
// ────────────────────────────────────────────────────────────

export type ValidationCode =
  | 'not_json'
  | 'not_object'
  | 'wrong_app'
  | 'unknown_type'
  | 'wrong_type'
  | 'version_too_high'
  | 'bad_shape'

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationCode; message: string }

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function parseJson(text: string): ValidateResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, code: 'not_json', message: '올바른 JSON 파일이 아니에요.' }
  }
}

/** 백업 파일 공통 헤더 검사 → app · schemaVersion. type은 호출부가 좁힌다. */
function checkHeader(raw: unknown): ValidateResult<Record<string, unknown>> {
  if (!isObject(raw)) {
    return { ok: false, code: 'not_object', message: '백업 파일 형식이 아니에요.' }
  }
  if (raw.app !== APP_ID) {
    return { ok: false, code: 'wrong_app', message: '이 앱의 백업 파일이 아니에요.' }
  }
  const ver = raw.schemaVersion
  if (typeof ver !== 'number' || !Number.isFinite(ver)) {
    return { ok: false, code: 'bad_shape', message: '스키마 버전 정보가 없어요.' }
  }
  if (ver > SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'version_too_high',
      message: '이 파일은 더 최신 버전에서 만들어졌어요. 앱을 업데이트한 뒤 다시 시도하세요.',
    }
  }
  return { ok: true, value: raw }
}

function isCourseArray(x: unknown): x is Course[] {
  return (
    Array.isArray(x) &&
    x.every(
      (c) =>
        isObject(c) &&
        typeof c.id === 'string' &&
        typeof c.credits === 'number' &&
        typeof c.state === 'string',
    )
  )
}

/**
 * 요건 세트가 엔진이 실제로 읽는 필수 필드를 갖췄는지 검증한다.
 * id·name만 보면 buckets 등이 빠진 세트가 통과해 evaluate()에서 크래시하므로,
 * 엔진이 참조하는 buckets·nonCurricular·totalCredits·minGPA·trackType까지 확인한다.
 */
function isRequirementSet(x: unknown): x is RequirementSet {
  return (
    isObject(x) &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.trackType === 'string' &&
    typeof x.totalCredits === 'number' &&
    typeof x.minGPA === 'number' &&
    Array.isArray(x.buckets) &&
    Array.isArray(x.nonCurricular)
  )
}

function isRequirementSetArray(x: unknown): x is RequirementSet[] {
  return Array.isArray(x) && x.every(isRequirementSet)
}

/** 개인 전체 백업 검증. 공유(reqset) 파일이 들어오면 wrong_type으로 거부. */
export function validatePersonalBackup(raw: unknown): ValidateResult<PersonalBackup> {
  const head = checkHeader(raw)
  if (!head.ok) return head
  const o = head.value

  if (o.type === 'ajou-grad-reqset') {
    return {
      ok: false,
      code: 'wrong_type',
      message: '이 파일은 요건 세트 공유 파일이에요. 개인 백업 불러오기에는 쓸 수 없어요.',
    }
  }
  if (o.type !== 'ajou-grad-backup') {
    return { ok: false, code: 'unknown_type', message: '알 수 없는 백업 유형이에요.' }
  }
  if (!(isObject(o.profile) || o.profile === null)) {
    return { ok: false, code: 'bad_shape', message: '프로필 데이터가 손상됐어요.' }
  }
  if (!isCourseArray(o.courses)) {
    return { ok: false, code: 'bad_shape', message: '과목 데이터가 손상됐어요.' }
  }
  if (!isObject(o.noncurricular)) {
    return { ok: false, code: 'bad_shape', message: '비교과 데이터가 손상됐어요.' }
  }
  if (!isRequirementSetArray(o.customSets)) {
    return { ok: false, code: 'bad_shape', message: '커스텀 세트 데이터가 손상됐어요.' }
  }
  if (!isObject(o.settings)) {
    return { ok: false, code: 'bad_shape', message: '설정 데이터가 손상됐어요.' }
  }
  return { ok: true, value: migratePersonalBackup(o as unknown as PersonalBackup) }
}

/** 요건 세트 공유 파일 검증. 개인 백업이 들어오면 wrong_type으로 거부. */
export function validateReqsetShare(raw: unknown): ValidateResult<ReqsetShare> {
  const head = checkHeader(raw)
  if (!head.ok) return head
  const o = head.value

  if (o.type === 'ajou-grad-backup') {
    return {
      ok: false,
      code: 'wrong_type',
      message: '개인 백업은 요건 세트 공유로 불러올 수 없어요. 개인 데이터가 섞이지 않게 막았어요.',
    }
  }
  if (o.type !== 'ajou-grad-reqset') {
    return { ok: false, code: 'unknown_type', message: '알 수 없는 파일 유형이에요.' }
  }
  if (!isRequirementSetArray(o.requirementSets) || o.requirementSets.length === 0) {
    return { ok: false, code: 'bad_shape', message: '요건 세트 데이터가 손상됐어요.' }
  }
  return { ok: true, value: migrateReqsetShare(o as unknown as ReqsetShare) }
}

// ────────────────────────────────────────────────────────────
// 마이그레이션 (현재 v1 — 항등. 구조만 갖춰 둔다)
// ────────────────────────────────────────────────────────────

export function migratePersonalBackup(b: PersonalBackup): PersonalBackup {
  // 예: if (b.schemaVersion < 2) { …필드 변환… }
  return { ...b, schemaVersion: SCHEMA_VERSION }
}

export function migrateReqsetShare(s: ReqsetShare): ReqsetShare {
  return { ...s, schemaVersion: SCHEMA_VERSION }
}

/** 저장 덩어리 봉투 마이그레이션. 버전이 앱보다 높으면 null(무시). */
export function migrateEnvelope<T>(env: Envelope<T>): Envelope<T> | null {
  if (typeof env.v !== 'number' || env.v > SCHEMA_VERSION) return null
  // v1 → 현재: 변환 없음.
  return env
}

// ────────────────────────────────────────────────────────────
// 미리보기 요약 (불러오기 확인 화면용)
// ────────────────────────────────────────────────────────────

export interface PersonalPreview {
  exportedAt: string
  admissionYear: number | null
  department: string | null
  trackType: string | null
  courseCount: number
  customSetCount: number
}

export function previewPersonal(b: PersonalBackup): PersonalPreview {
  return {
    exportedAt: b.exportedAt,
    admissionYear: b.profile?.admissionYear ?? null,
    department: b.profile?.department ?? null,
    trackType: b.profile?.trackType ?? null,
    courseCount: b.courses.length,
    customSetCount: b.customSets.length,
  }
}

export interface SharePreview {
  exportedAt: string
  sets: { id: string; name: string }[]
}

export function previewShare(s: ReqsetShare): SharePreview {
  return {
    exportedAt: s.exportedAt,
    sets: s.requirementSets.map((r) => ({ id: r.id, name: r.name })),
  }
}
