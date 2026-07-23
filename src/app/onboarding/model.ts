/**
 * 온보딩 순수 모델 — 화면 없이 테스트 가능한 도메인 로직.
 *
 * 마법사가 모은 입력(OnboardingDraft)을 저장 가능한 결과(Profile + 커스텀 요건 세트)로
 * 변환한다. React·localStorage·Date.now()를 참조하지 않는다(시각·id는 인자로 받는다).
 * 요건 숫자는 프리셋(RequirementSet)에서 오고, 사용자가 고친 값만 복제본에 얹는다.
 */

import type {
  AdditionalMajorRule,
  Profile,
  RequirementSet,
} from '../../engine/index'
import { evalCondition } from '../../engine/index'

export type TrackType = 'advanced' | 'general' | 'accredited'

/** 과정 구분 — 라벨 + 선택 박스 아래 설명(Q4: 헷갈리지 않게 병기). */
export const TRACK_INFO: Record<TrackType, { label: string; short: string; desc: string }> = {
  advanced: {
    label: '심화과정',
    short: '심화',
    desc: '추가 전공 없이 제1전공을 깊게 이수합니다. 전공선택 학점이 많고(예: 37학점), 전공역량·산학프로젝트·프로그래밍 인증이 필요합니다.',
  },
  general: {
    label: '일반과정',
    short: '일반',
    desc: '전공선택 학점이 적은 대신(예: 10학점) 복수전공·부전공 등 추가 전공을 1개 이상 반드시 이수해야 합니다. 심화과정의 인증 3종은 없습니다.',
  },
  accredited: {
    label: '공학인증',
    short: '공학인증',
    desc: '공학교육인증(ABEEK) 프로그램을 따르는 과정입니다. 제공 학과가 정해져 있어 전용 요건 세트가 필요합니다. 프리셋이 없으면 빈 세트로 시작해 직접 채워요.',
  },
}

export const TRACK_ORDER: TrackType[] = ['advanced', 'general', 'accredited']

/** 전공 이수원칙 예외(majorPolicy.exemptions) id → 표시 라벨. 미정의 id는 그대로 노출. */
export const EXEMPTION_LABELS: Record<string, string> = {
  dual_degree: '복수학위과정(교환·해외대학)',
  linked_masters: '학·석사 연계과정',
}

/**
 * 빈 세트 시작 시의 시작값(placeholder). 요람마다 달라 사용자가 요건 확인에서 고친다.
 * 특정 요건 세트의 확정 숫자가 아니라 "사용자가 만드는 세트의 초기 입력값"이며,
 * 화면 문구도 이 상수를 참조해 단일 출처로 둔다(하드코딩 분산 방지).
 */
export const DEFAULT_TOTAL_CREDITS = 130
export const DEFAULT_MIN_GPA = 2.0

// ────────────────────────────────────────────────────────────
// Draft — 마법사가 채우는 진행 중 입력
// ────────────────────────────────────────────────────────────

export interface AdditionalMajorDraft {
  /** React 키이자 최종 규칙 id. */
  instanceId: string
  baseRuleId: string
  type: AdditionalMajorRule['type']
  typeLabel: string
  displayName: string
  totalMinCredits: number
  homeOverlapCap: number
  satisfiesMajorPolicy: boolean
}

export interface ReqEdits {
  totalCredits: number | null
  minGPA: number | null
  /** bucketId → 수정된 최소학점(원본과 다를 때만). */
  bucketMinCredits: Record<string, number>
}

export type ReqsetChoice =
  | { kind: 'preset'; presetId: string }
  | { kind: 'empty' }
  | { kind: 'shared'; set: RequirementSet }

export interface OnboardingDraft {
  admissionYear: number | null
  college: string
  department: string
  /** 큐레이션 목록에서 고른 학과의 slug(빈 세트 id 생성용). 직접 입력이면 null. */
  departmentSlug: string | null
  trackType: TrackType | null
  reqset: ReqsetChoice | null
  additionalMajors: AdditionalMajorDraft[]
  exemptions: string[]
  isTransferStudent: boolean
  /** 'YYYY-1' | 'YYYY-2' | '' (미입력). */
  currentSemester: string
  targetGraduation: string
  reqEdits: ReqEdits
}

export function emptyDraft(): OnboardingDraft {
  return {
    admissionYear: null,
    college: '',
    department: '',
    departmentSlug: null,
    trackType: null,
    reqset: null,
    additionalMajors: [],
    exemptions: [],
    isTransferStudent: false,
    currentSemester: '',
    targetGraduation: '',
    reqEdits: { totalCredits: null, minGPA: null, bucketMinCredits: {} },
  }
}

// ────────────────────────────────────────────────────────────
// 프리셋 조회
// ────────────────────────────────────────────────────────────

export interface PresetOption {
  id: string
  admissionYear: number | null
  college: string
  department: string
  trackType: string
  name: string
}

export function presetOptions(registry: Record<string, RequirementSet>): PresetOption[] {
  return Object.values(registry).map((s) => ({
    id: s.id,
    admissionYear: s.admissionYearFrom ?? null,
    college: s.college ?? '',
    department: s.department ?? '',
    trackType: s.trackType,
    name: s.name,
  }))
}

function yearInRange(s: RequirementSet, year: number): boolean {
  return (
    (s.admissionYearFrom == null || year >= s.admissionYearFrom) &&
    (s.admissionYearTo == null || year <= s.admissionYearTo)
  )
}

/** (학번, 학과, 과정)에 맞는 프리셋 id. 없으면 null(→ 빈 세트/JSON 경로). */
export function findPresetId(
  registry: Record<string, RequirementSet>,
  year: number | null,
  department: string,
  track: TrackType | null,
): string | null {
  if (year == null || !department || !track) return null
  const hit = Object.values(registry).find(
    (s) => s.department === department && s.trackType === track && yearInRange(s, year),
  )
  return hit?.id ?? null
}

/** 학과에 (과정 불문) 프리셋이 하나라도 있는지 — 학과 목록의 "기본 제공" 뱃지용. */
export function departmentHasPreset(
  registry: Record<string, RequirementSet>,
  year: number | null,
  department: string,
): boolean {
  if (!department) return false
  return Object.values(registry).some(
    (s) => s.department === department && (year == null || yearInRange(s, year)),
  )
}

// ────────────────────────────────────────────────────────────
// 추가 전공 템플릿 ↔ draft ↔ 규칙
// ────────────────────────────────────────────────────────────

export function makeAdditionalMajorDraft(
  rule: AdditionalMajorRule,
  instanceId: string,
): AdditionalMajorDraft {
  return {
    instanceId,
    baseRuleId: rule.id,
    type: rule.type,
    typeLabel: rule.typeLabel,
    displayName: rule.name,
    totalMinCredits: rule.totalMinCredits,
    homeOverlapCap: rule.homeOverlapCap,
    satisfiesMajorPolicy: rule.satisfiesMajorPolicy,
  }
}

/** draft → 엔진·저장이 읽는 AdditionalMajorRule. id는 instanceId(프로필의 ruleId와 일치). */
export function draftToRule(am: AdditionalMajorDraft): AdditionalMajorRule {
  return {
    id: am.instanceId,
    name: am.displayName.trim() || am.typeLabel,
    type: am.type,
    typeLabel: am.typeLabel,
    totalMinCredits: am.totalMinCredits,
    homeOverlapCap: am.homeOverlapCap,
    satisfiesMajorPolicy: am.satisfiesMajorPolicy,
    sourceNote: `온보딩에서 ${am.typeLabel}(원본 ${am.baseRuleId})을 기준으로 사용자가 설정.`,
  }
}

// ────────────────────────────────────────────────────────────
// 요건 세트 편집(프리셋 복제) / 빈 세트
// ────────────────────────────────────────────────────────────

/** 프리셋 대비 사용자가 핵심 숫자를 바꿨는지(총학점·최저평점·영역 최소학점). */
export function hasReqEdits(base: RequirementSet, edits: ReqEdits): boolean {
  if (edits.totalCredits != null && edits.totalCredits !== base.totalCredits) return true
  if (edits.minGPA != null && edits.minGPA !== base.minGPA) return true
  for (const b of base.buckets) {
    const e = edits.bucketMinCredits[b.id]
    if (e != null && e !== b.minCredits) return true
  }
  return false
}

function applyEdits(base: RequirementSet, edits: ReqEdits): RequirementSet {
  return {
    ...base,
    totalCredits: edits.totalCredits ?? base.totalCredits,
    minGPA: edits.minGPA ?? base.minGPA,
    buckets: base.buckets.map((b) => {
      const e = edits.bucketMinCredits[b.id]
      return e != null ? { ...b, minCredits: e } : b
    }),
  }
}

/** 프리셋을 복제한 커스텀 세트(reqsets:custom로 분기). 원본 id를 source.basePresetId에 남긴다. */
function cloneForEdit(base: RequirementSet, edits: ReqEdits, now: string): RequirementSet {
  return {
    ...applyEdits(base, edits),
    id: `${base.id}__custom`,
    name: `${base.name} (내 편집본)`,
    createdAt: now,
    updatedAt: now,
    source: { ...(base.source ?? {}), basePresetId: base.id, customizedInOnboarding: true },
  }
}

/** 학과 slug가 없을 때(직접 입력) 학과명에서 안정적·고유한 slug를 만든다(순수 해시). */
function slugifyDept(name: string): string {
  const n = name.trim()
  if (!n) return 'custom'
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0
  return `custom${(h >>> 0).toString(36)}`
}

/** 빈 세트 — 영역은 없고 총학점·최저평점만. 요건 탭 편집기(6단계)에서 영역을 추가한다. */
export function buildEmptyReqSet(draft: OnboardingDraft, now: string): RequirementSet {
  const year = draft.admissionYear ?? 0
  // 직접 입력 학과는 slug가 없어 학과명 해시로 고유화(서로 다른 학과가 같은 id로 충돌하지 않게).
  const slug = draft.departmentSlug ?? slugifyDept(draft.department)
  const track: TrackType = draft.trackType ?? 'advanced'
  const label = `${draft.department || '사용자'} ${year || ''} · ${TRACK_INFO[track].label} (직접 구성)`
  return {
    schemaVersion: 2,
    requirementVersion: `${year}-${slug}-${track}-empty-v1`,
    id: `rs_${year}_${slug}_${track}_custom`,
    name: label.replace(/\s+/g, ' ').trim(),
    admissionYearFrom: year || undefined,
    admissionYearTo: year || undefined,
    college: draft.college,
    department: draft.department,
    trackType: track,
    totalCredits: draft.reqEdits.totalCredits ?? DEFAULT_TOTAL_CREDITS,
    minGPA: draft.reqEdits.minGPA ?? DEFAULT_MIN_GPA,
    buckets: [],
    nonCurricular: [],
    createdAt: now,
    updatedAt: now,
    source: {
      verified: false,
      note: '온보딩에서 빈 세트로 시작 — 요건 탭 편집기에서 영역·필수 과목을 추가하세요.',
    },
  }
}

/** 요건 확인에 쓸 기준 세트(프리셋/공유). 빈 세트는 기준 영역이 없어 null. */
export function baseReqSet(
  draft: OnboardingDraft,
  registry: Record<string, RequirementSet>,
): RequirementSet | null {
  const c = draft.reqset
  if (c?.kind === 'preset') return registry[c.presetId] ?? null
  if (c?.kind === 'shared') return c.set
  return null
}

// ────────────────────────────────────────────────────────────
// 최종 커밋 — Draft → { profile, customSets }
// ────────────────────────────────────────────────────────────

export interface OnboardingCommit {
  profile: Profile
  customSets: RequirementSet[]
}

function resolveReqset(
  draft: OnboardingDraft,
  registry: Record<string, RequirementSet>,
  now: string,
): { requirementSetId: string; reqSet: RequirementSet; customSets: RequirementSet[] } {
  const choice = draft.reqset
  if (choice?.kind === 'preset') {
    const base = registry[choice.presetId]
    if (base) {
      if (hasReqEdits(base, draft.reqEdits)) {
        const clone = cloneForEdit(base, draft.reqEdits, now)
        return { requirementSetId: clone.id, reqSet: clone, customSets: [clone] }
      }
      return { requirementSetId: base.id, reqSet: base, customSets: [] }
    }
    // 프리셋 id가 사라진 예외 상황 → 빈 세트로 폴백
  }
  if (choice?.kind === 'shared') {
    const set = hasReqEdits(choice.set, draft.reqEdits)
      ? { ...applyEdits(choice.set, draft.reqEdits), updatedAt: now }
      : choice.set
    return { requirementSetId: set.id, reqSet: set, customSets: [set] }
  }
  const empty = buildEmptyReqSet(draft, now)
  return { requirementSetId: empty.id, reqSet: empty, customSets: [empty] }
}

function buildProfile(
  draft: OnboardingDraft,
  requirementSetId: string,
  reqSet: RequirementSet,
  now: string,
): Profile {
  return {
    schemaVersion: 2,
    admissionYear: draft.admissionYear ?? 0,
    college: reqSet.college ?? draft.college,
    department: reqSet.department ?? draft.department,
    trackType: draft.trackType ?? reqSet.trackType,
    requirementSetId,
    additionalMajors: draft.additionalMajors.map((am) => ({
      ruleId: am.instanceId,
      active: true,
      startedAt: now,
      rule: draftToRule(am),
      displayName: am.displayName.trim() || am.typeLabel,
    })),
    exemptions: [...draft.exemptions],
    isTransferStudent: draft.isTransferStudent,
    currentSemester: draft.currentSemester || undefined,
    targetGraduation: draft.targetGraduation || undefined,
    onboardingCompleted: true,
  }
}

/** 마법사 완료 → 저장할 개인 상태 조각. now/id는 순수성을 위해 인자로 받는다. */
export function buildCommit(
  draft: OnboardingDraft,
  registry: Record<string, RequirementSet>,
  now: string,
): OnboardingCommit {
  const { requirementSetId, reqSet, customSets } = resolveReqset(draft, registry, now)
  return { profile: buildProfile(draft, requirementSetId, reqSet, now), customSets }
}

// ────────────────────────────────────────────────────────────
// 단계별 검증
// ────────────────────────────────────────────────────────────

export function profileStepValid(d: OnboardingDraft): boolean {
  return d.admissionYear != null && d.department.trim() !== '' && d.trackType != null
}

export function reqsetStepValid(d: OnboardingDraft): boolean {
  return d.reqset != null
}

/**
 * 추가 전공을 1건 이상 강제해야 하는가.
 * - 일반과정은 항상 강제(빈 세트라 majorPolicy가 없어도 아주대 일반과정 규칙상 필요).
 * - 그 외엔 선택된 요건 세트의 majorPolicy.requiredWhen을 엔진과 동일하게 평가(하드코딩 대신 데이터).
 *   → 엔진 판정(checkMajorPolicy)과 온보딩 강제 조건이 어긋나지 않는다.
 */
export function requiresAdditionalMajor(d: OnboardingDraft, reqSet: RequirementSet | null): boolean {
  if (d.trackType === 'general') return true
  const policy = reqSet?.majorPolicy
  if (!policy) return false
  return evalCondition(policy.requiredWhen ?? null, { trackType: d.trackType } as unknown as Profile)
}

/** 추가 전공 강제 시 1건 이상. 아니면 자유. */
export function additionalStepValid(d: OnboardingDraft, reqSet: RequirementSet | null): boolean {
  if (requiresAdditionalMajor(d, reqSet)) return d.additionalMajors.length >= 1
  return true
}

/** 강제 대상인데 고른 추가전공이 전공이수원칙을 충족하지 못하면 경고(진행은 허용). */
export function majorPolicyWarning(d: OnboardingDraft, reqSet: RequirementSet | null): string | null {
  if (!requiresAdditionalMajor(d, reqSet)) return null
  if (d.additionalMajors.length === 0) return null
  const anySatisfies = d.additionalMajors.some((am) => am.satisfiesMajorPolicy)
  if (anySatisfies) return null
  return '고른 추가 전공이 전공이수원칙(복수/부전공 1건)을 충족하지 않을 수 있어요. 요건 확인에서 다시 살펴보세요.'
}

// ────────────────────────────────────────────────────────────
// 화면 보조값
// ────────────────────────────────────────────────────────────

/** 학번 후보(내림차순). now의 연도를 인자로 받아 순수 유지. */
export function admissionYearOptions(currentYear: number, span = 12): number[] {
  const out: number[] = []
  for (let y = currentYear; y > currentYear - span; y--) out.push(y)
  return out
}

/** 'YYYY-1'|'YYYY-2' 라벨. */
export function semesterLabel(v: string): string {
  const m = v.match(/^(\d{4})-([12])$/)
  if (!m) return v
  return `${m[1]}년 ${m[2] === '1' ? '1학기' : '2학기'}`
}

/** 학번~+span년의 정규학기 옵션. */
export function semesterOptions(fromYear: number | null, span = 8): string[] {
  if (fromYear == null) return []
  const out: string[] = []
  for (let y = fromYear; y < fromYear + span; y++) {
    out.push(`${y}-1`, `${y}-2`)
  }
  return out
}
