/**
 * 요건 세트 편집기 — 순수 로직.
 *
 * 활성 요건 세트를 편집 가능한 작업본으로 만들고(프리셋은 복제), 영역(bucket)과
 * 비교과 요건(nonCurricular)을 추가·수정·삭제하는 순수 변환 함수. 비교과 진행 상태
 * (NonCurricularState) 입력 헬퍼도 여기 둔다. React·localStorage·Date를 참조하지 않는다
 * (id·시각은 인자로 받는다) → 화면 없이 테스트 가능.
 *
 * 아키텍처: 요건 숫자는 전부 세트(데이터)에서 오고 편집으로만 바뀐다(하드코딩 없음).
 * 프리셋(번들 JSON)은 불변 — 편집하면 항상 커스텀 세트로 복제한다(온보딩 clone-on-edit와 동일).
 */

import type {
  Bucket,
  BucketGroup,
  ChoiceGroup,
  Condition,
  NonCurricularState,
  Requirement,
  RequirementAlternative,
  RequirementGroup,
  RequirementSet,
  RequirementType,
} from '../engine/index'

// ────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────

/** JSON 직렬화 가능한 값의 깊은 복제. 요건 세트는 순수 데이터라 안전. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

/** `prefix_N` 형태의, existing과 충돌하지 않는 id. */
export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const used = new Set(existing)
  let n = 1
  while (used.has(`${prefix}_${n}`)) n++
  return `${prefix}_${n}`
}

/** 커스텀 세트가 복제 시 남긴 원본 프리셋 id(카탈로그 번들 해석용). */
function basePresetId(set: RequirementSet): string | null {
  const v = set.source?.['basePresetId']
  return typeof v === 'string' ? v : null
}

/** 프리셋 편집본 id. `{baseId}__custom`을 우선 쓰고 충돌 시 `_N`을 붙인다. */
export function customIdFor(baseId: string, existing: Iterable<string>): string {
  const preferred = `${baseId}__custom`
  const used = new Set(existing)
  return used.has(preferred) ? uniqueId(`${baseId}__custom`, existing) : preferred
}

// ────────────────────────────────────────────────────────────
// 표시용 상수(구분·요건 유형)
// ────────────────────────────────────────────────────────────

export const BUCKET_GROUPS: { value: BucketGroup; label: string; desc: string }[] = [
  { value: 'university_required', label: '대학필수', desc: '아주인성·영어·글쓰기·영역별교양 등 대학 공통' },
  { value: 'department_required', label: '학과필수', desc: '수학·기초과학·학과 세미나 등 학과 공통' },
  { value: 'major_required', label: '전공필수', desc: '전공 필수 과목 — 전공 평점 대상' },
  { value: 'major_elective', label: '전공선택', desc: '전공 선택 과목 — 전공 평점 대상' },
  { value: 'general_elective', label: '일반선택', desc: '자유 이수 학점' },
]

export const BUCKET_GROUP_LABEL: Record<BucketGroup, string> = {
  university_required: '대학필수',
  department_required: '학과필수',
  major_required: '전공필수',
  major_elective: '전공선택',
  general_elective: '일반선택',
}

export const REQUIREMENT_TYPES: { value: RequirementType; label: string; hint: string }[] = [
  { value: 'check', label: '완료 여부', hint: '했다/안 했다 토글(예: 사회봉사).' },
  { value: 'count', label: '횟수', hint: '정해진 횟수 이상(예: 전공역량 인증 2회).' },
  { value: 'score', label: '점수 기준', hint: '기준 점수 이상 1건(예: TOPCIT 190).' },
  { value: 'level', label: '등급 기준', hint: '기준 등급 이상(예: OPIc IL).' },
  { value: 'alternatives', label: '택1(여러 시험 중)', hint: '여러 시험 중 정해진 개수 충족(예: 영어 인증).' },
  { value: 'courseGroupPick', label: '과목군 이수', hint: '과목군에서 정해진 개수 이수 — 과목 입력으로 자동 판정(예: 산학프로젝트).' },
]

export const ALTERNATIVE_TYPES: { value: RequirementAlternative['type']; label: string }[] = [
  { value: 'check', label: '완료 여부' },
  { value: 'score', label: '점수' },
  { value: 'level', label: '등급' },
]

// ────────────────────────────────────────────────────────────
// appliesWhen ↔ 과정 적용 모드
// ────────────────────────────────────────────────────────────

/**
 * 비교과 요건의 적용 대상(과정). 편집 UI가 다루는 3가지 + 표현 불가 조건 보존용 'custom'.
 * 'custom'은 셀렉트 기본 목록엔 없고, 원본이 표현 불가일 때만 조건부로 노출한다.
 */
export type AppliesMode = 'always' | 'advanced' | 'general' | 'custom'

export const APPLIES_MODES: { value: AppliesMode; label: string }[] = [
  { value: 'always', label: '모든 과정' },
  { value: 'advanced', label: '심화과정만' },
  { value: 'general', label: '일반과정만' },
]

/**
 * 조건식 → 적용 모드. trackType eq advanced/general·null만 표현하고, 그 밖의 조건
 * (neq·다른 field 등)은 'custom'으로 둬서 편집기가 원본 조건을 조용히 덮어쓰지 않게 한다.
 */
export function appliesModeOf(cond: Condition | null | undefined): AppliesMode {
  if (!cond) return 'always'
  if (cond.field === 'trackType' && cond.op === 'eq' && cond.value === 'advanced') return 'advanced'
  if (cond.field === 'trackType' && cond.op === 'eq' && cond.value === 'general') return 'general'
  return 'custom'
}

/** 적용 모드 → 조건식. 'custom'은 매핑 대상이 아니다(원본 유지 — 호출부가 patch를 생략한다). */
export function appliesCondOf(mode: AppliesMode): Condition | null {
  if (mode === 'advanced') return { field: 'trackType', op: 'eq', value: 'advanced' }
  if (mode === 'general') return { field: 'trackType', op: 'eq', value: 'general' }
  return null
}

/** 쉼표 구분 문자열 → 등급 스케일 배열(공백·빈값 정리). 낮은→높은 순. */
export function parseScale(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 등급 스케일 배열 → 쉼표 구분 문자열(편집기 텍스트 입력용). */
export function joinScale(scale: string[] | undefined): string {
  return (scale ?? []).join(', ')
}

// ────────────────────────────────────────────────────────────
// 복제 / 편집 작업본 만들기
// ────────────────────────────────────────────────────────────

/**
 * 세트 복제("2021 SW" → "2025 SW"). 새 id·이름으로 깊은 복제하고
 * source.basePresetId(원본 프리셋)를 보존해 카탈로그 번들 해석이 이어지게 한다.
 */
export function cloneReqSet(
  base: RequirementSet,
  opts: { id: string; name: string; now: string },
): RequirementSet {
  const c = clone(base)
  return {
    ...c,
    id: opts.id,
    name: opts.name,
    createdAt: opts.now,
    updatedAt: opts.now,
    source: {
      ...(c.source ?? {}),
      basePresetId: basePresetId(base) ?? base.id,
      clonedFrom: base.id,
    },
  }
}

/**
 * 편집 시작 — 작업본을 만든다.
 * - 커스텀 세트: 깊은 복제(같은 id로 제자리 편집).
 * - 프리셋(번들, 불변): 새 id·"(내 편집본)" 이름으로 복제해 커스텀으로 분기.
 */
export function startEdit(
  active: RequirementSet,
  isPreset: boolean,
  newId: string,
  now: string,
): RequirementSet {
  const c = clone(active)
  if (!isPreset) return c
  return {
    ...c,
    id: newId,
    name: `${active.name} (내 편집본)`,
    createdAt: now,
    updatedAt: now,
    source: {
      ...(c.source ?? {}),
      basePresetId: basePresetId(active) ?? active.id,
      customizedInEditor: true,
    },
  }
}

// ────────────────────────────────────────────────────────────
// 내부 매핑 헬퍼
// ────────────────────────────────────────────────────────────

function mapBucket(set: RequirementSet, bucketId: string, fn: (b: Bucket) => Bucket): RequirementSet {
  return { ...set, buckets: set.buckets.map((b) => (b.id === bucketId ? fn(b) : b)) }
}

function mapChoiceGroup(
  set: RequirementSet,
  bucketId: string,
  groupId: string,
  fn: (g: ChoiceGroup) => ChoiceGroup,
): RequirementSet {
  return mapBucket(set, bucketId, (b) => ({
    ...b,
    choiceGroups: (b.choiceGroups ?? []).map((g) => (g.id === groupId ? fn(g) : g)),
  }))
}

function mapRequirement(
  set: RequirementSet,
  reqId: string,
  fn: (r: Requirement) => Requirement,
): RequirementSet {
  return { ...set, nonCurricular: set.nonCurricular.map((r) => (r.id === reqId ? fn(r) : r)) }
}

/** 중복·공백을 정리해 courseKey를 배열에 추가한다. */
function pushKey(list: string[] | undefined, courseKey: string): string[] {
  const key = courseKey.trim()
  const arr = list ?? []
  if (!key || arr.includes(key)) return arr
  return [...arr, key]
}

// ────────────────────────────────────────────────────────────
// 영역(bucket) 편집
// ────────────────────────────────────────────────────────────

export function blankBucket(set: RequirementSet): Bucket {
  return {
    id: uniqueId('bucket_custom', set.buckets.map((b) => b.id)),
    label: '',
    group: 'major_elective',
    minCredits: 0,
  }
}

export function addBucket(set: RequirementSet, bucket: Bucket): RequirementSet {
  return { ...set, buckets: [...set.buckets, bucket] }
}

export function updateBucket(
  set: RequirementSet,
  bucketId: string,
  patch: Partial<Bucket>,
): RequirementSet {
  return mapBucket(set, bucketId, (b) => ({ ...b, ...patch }))
}

export function removeBucket(set: RequirementSet, bucketId: string): RequirementSet {
  // 삭제한 영역을 가리키던 이월(overflowTo)·상한(capBucket) 참조를 정리한다(댕글링 방지).
  return {
    ...set,
    buckets: set.buckets
      .filter((b) => b.id !== bucketId)
      .map((b) => (b.overflowTo === bucketId ? { ...b, overflowTo: null } : b)),
    courseGroups: set.courseGroups?.map((g) => ({
      ...g,
      capBucket: g.capBucket === bucketId ? null : g.capBucket,
      overflowTo: g.overflowTo === bucketId ? null : g.overflowTo,
    })),
  }
}

export function addRequiredCourse(
  set: RequirementSet,
  bucketId: string,
  courseKey: string,
): RequirementSet {
  return mapBucket(set, bucketId, (b) => ({ ...b, requiredCourses: pushKey(b.requiredCourses, courseKey) }))
}

export function removeRequiredCourse(
  set: RequirementSet,
  bucketId: string,
  courseKey: string,
): RequirementSet {
  return mapBucket(set, bucketId, (b) => ({
    ...b,
    requiredCourses: (b.requiredCourses ?? []).filter((k) => k !== courseKey),
  }))
}

// 택1(택N) 그룹 -------------------------------------------------

export function addChoiceGroup(set: RequirementSet, bucketId: string): RequirementSet {
  return mapBucket(set, bucketId, (b) => {
    const group: ChoiceGroup = {
      id: uniqueId('choice', (b.choiceGroups ?? []).map((g) => g.id)),
      label: '',
      pick: 1,
      courses: [],
    }
    return { ...b, choiceGroups: [...(b.choiceGroups ?? []), group] }
  })
}

export function updateChoiceGroup(
  set: RequirementSet,
  bucketId: string,
  groupId: string,
  patch: Partial<ChoiceGroup>,
): RequirementSet {
  return mapChoiceGroup(set, bucketId, groupId, (g) => ({ ...g, ...patch }))
}

export function removeChoiceGroup(
  set: RequirementSet,
  bucketId: string,
  groupId: string,
): RequirementSet {
  return mapBucket(set, bucketId, (b) => ({
    ...b,
    choiceGroups: (b.choiceGroups ?? []).filter((g) => g.id !== groupId),
  }))
}

export function addChoiceCourse(
  set: RequirementSet,
  bucketId: string,
  groupId: string,
  courseKey: string,
): RequirementSet {
  return mapChoiceGroup(set, bucketId, groupId, (g) => ({ ...g, courses: pushKey(g.courses, courseKey) }))
}

export function removeChoiceCourse(
  set: RequirementSet,
  bucketId: string,
  groupId: string,
  courseKey: string,
): RequirementSet {
  return mapChoiceGroup(set, bucketId, groupId, (g) => ({
    ...g,
    courses: g.courses.filter((k) => k !== courseKey),
  }))
}

// ────────────────────────────────────────────────────────────
// 비교과 요건(nonCurricular) 정의 편집
// ────────────────────────────────────────────────────────────

export function blankRequirement(set: RequirementSet): Requirement {
  return {
    id: uniqueId('nc_custom', set.nonCurricular.map((r) => r.id)),
    label: '',
    type: 'check',
    appliesWhen: null,
  }
}

export function addRequirement(set: RequirementSet, req: Requirement): RequirementSet {
  return { ...set, nonCurricular: [...set.nonCurricular, req] }
}

export function updateRequirement(
  set: RequirementSet,
  reqId: string,
  patch: Partial<Requirement>,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({ ...r, ...patch }))
}

export function removeRequirement(set: RequirementSet, reqId: string): RequirementSet {
  return { ...set, nonCurricular: set.nonCurricular.filter((r) => r.id !== reqId) }
}

/**
 * 요건 유형 전환 — 새 유형에서 의미 있는 필드만 남기고 나머지를 정리한다.
 * (예: alternatives→check 시 alternatives 배열, score→level 시 숫자 min을 버려 죽은 데이터·오판정 방지.)
 */
export function changeRequirementType(
  set: RequirementSet,
  reqId: string,
  type: RequirementType,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => {
    const keep: Requirement = {
      id: r.id,
      label: r.label,
      type,
      appliesWhen: r.appliesWhen ?? null,
    }
    if (r.shortLabel) keep.shortLabel = r.shortLabel
    if (r.helpText) keep.helpText = r.helpText
    if (r.sourceNote) keep.sourceNote = r.sourceNote
    if (type === 'count' || type === 'score') {
      if (typeof r.min === 'number') keep.min = r.min
      if (r.unit) keep.unit = r.unit
    } else if (type === 'level') {
      if (r.scale) keep.scale = r.scale
      if (typeof r.min === 'string') keep.min = r.min
    } else if (type === 'alternatives') {
      keep.pick = r.pick ?? 1
      keep.alternatives = r.alternatives ?? []
    } else if (type === 'courseGroupPick') {
      keep.pick = r.pick ?? 1
      keep.groups = r.groups ?? []
      if (r.pickUnit) keep.pickUnit = r.pickUnit // 선택 단위(과목/과목군) 보존
    }
    return keep
  })
}

/** 택1 시험 항목의 유형 전환 — 새 유형에서 유효한 필드만 남긴다. */
export function changeAlternativeType(
  set: RequirementSet,
  reqId: string,
  altId: string,
  type: RequirementAlternative['type'],
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    alternatives: (r.alternatives ?? []).map((a) => {
      if (a.id !== altId) return a
      const keep: RequirementAlternative = { id: a.id, label: a.label, type }
      if (type === 'score') {
        if (typeof a.min === 'number') keep.min = a.min
        if (a.unit) keep.unit = a.unit
      } else if (type === 'level') {
        if (a.scale) keep.scale = a.scale
        if (typeof a.min === 'string') keep.min = a.min
      }
      return keep
    }),
  }))
}

// alternatives(택1 시험) --------------------------------------

export function addAlternative(set: RequirementSet, reqId: string): RequirementSet {
  return mapRequirement(set, reqId, (r) => {
    const alt: RequirementAlternative = {
      id: uniqueId('alt', (r.alternatives ?? []).map((a) => a.id)),
      label: '',
      type: 'check',
    }
    return { ...r, alternatives: [...(r.alternatives ?? []), alt] }
  })
}

export function updateAlternative(
  set: RequirementSet,
  reqId: string,
  altId: string,
  patch: Partial<RequirementAlternative>,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    alternatives: (r.alternatives ?? []).map((a) => (a.id === altId ? { ...a, ...patch } : a)),
  }))
}

export function removeAlternative(set: RequirementSet, reqId: string, altId: string): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    alternatives: (r.alternatives ?? []).filter((a) => a.id !== altId),
  }))
}

// courseGroupPick(과목군) -------------------------------------

export function addReqGroup(set: RequirementSet, reqId: string): RequirementSet {
  return mapRequirement(set, reqId, (r) => {
    const group: RequirementGroup = {
      id: uniqueId('grp', (r.groups ?? []).map((g) => g.id)),
      label: '',
      courses: [],
    }
    return { ...r, groups: [...(r.groups ?? []), group] }
  })
}

export function updateReqGroup(
  set: RequirementSet,
  reqId: string,
  groupId: string,
  patch: Partial<RequirementGroup>,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    groups: (r.groups ?? []).map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
  }))
}

export function removeReqGroup(set: RequirementSet, reqId: string, groupId: string): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    groups: (r.groups ?? []).filter((g) => g.id !== groupId),
  }))
}

export function addReqGroupCourse(
  set: RequirementSet,
  reqId: string,
  groupId: string,
  courseKey: string,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    groups: (r.groups ?? []).map((g) =>
      g.id === groupId ? { ...g, courses: pushKey(g.courses, courseKey) } : g,
    ),
  }))
}

export function removeReqGroupCourse(
  set: RequirementSet,
  reqId: string,
  groupId: string,
  courseKey: string,
): RequirementSet {
  return mapRequirement(set, reqId, (r) => ({
    ...r,
    groups: (r.groups ?? []).map((g) =>
      g.id === groupId ? { ...g, courses: g.courses.filter((k) => k !== courseKey) } : g,
    ),
  }))
}

// ────────────────────────────────────────────────────────────
// 검증
// ────────────────────────────────────────────────────────────

export interface ReqSetIssue {
  level: 'error' | 'warn'
  message: string
  bucketId?: string
  requirementId?: string
}

/** 저장 전 세트 무결성 검사. error가 하나라도 있으면 저장을 막는다. */
export function validateReqSet(set: RequirementSet): ReqSetIssue[] {
  const issues: ReqSetIssue[] = []

  if (set.name.trim().length === 0) issues.push({ level: 'error', message: '세트 이름을 입력하세요.' })
  if (!Number.isFinite(set.totalCredits) || set.totalCredits <= 0) {
    issues.push({ level: 'warn', message: '졸업 총 학점이 0이에요. 요람 값을 확인하세요.' })
  }
  if (!Number.isFinite(set.minGPA) || set.minGPA < 0) {
    issues.push({ level: 'error', message: '졸업 최저 평점을 0 이상으로 입력하세요.' })
  }

  const seenBucket = new Set<string>()
  for (const b of set.buckets) {
    if (seenBucket.has(b.id)) {
      issues.push({ level: 'error', message: `영역 id가 중복돼요: ${b.id}`, bucketId: b.id })
    }
    seenBucket.add(b.id)
    if (b.label.trim().length === 0) {
      issues.push({ level: 'error', message: '이름 없는 영역이 있어요.', bucketId: b.id })
    }
    if (!Number.isFinite(b.minCredits) || b.minCredits < 0) {
      issues.push({ level: 'error', message: `${b.label || b.id}의 최소 학점이 올바르지 않아요.`, bucketId: b.id })
    }
    for (const g of b.choiceGroups ?? []) {
      if (g.pick < 1) {
        issues.push({ level: 'warn', message: `${b.label || b.id}의 택1 그룹 선택 수가 1보다 작아요.`, bucketId: b.id })
      }
      if (g.pick > g.courses.length) {
        issues.push({
          level: 'warn',
          message: `${b.label || b.id}의 택1 그룹은 과목 수(${g.courses.length})보다 많이(${g.pick}) 고르게 돼 있어요.`,
          bucketId: b.id,
        })
      }
    }
  }

  const seenReq = new Set<string>()
  for (const r of set.nonCurricular) {
    const name = r.label || r.id
    if (seenReq.has(r.id)) {
      issues.push({ level: 'error', message: `비교과 요건 id가 중복돼요: ${r.id}`, requirementId: r.id })
    }
    seenReq.add(r.id)
    if (r.label.trim().length === 0) {
      issues.push({ level: 'error', message: '이름 없는 비교과 요건이 있어요.', requirementId: r.id })
    }

    // 기준값이 없으면 아무리 입력해도 판정이 고정된다 — level은 "무조건 충족"(오탐)이라 error,
    // count/score는 "영원히 미충족"(졸업 막힘)이라 warn.
    if ((r.type === 'count' || r.type === 'score') && typeof r.min !== 'number') {
      issues.push({
        level: 'warn',
        message: `${name}: 기준값이 비어 있어 아무리 입력해도 충족되지 않아요.`,
        requirementId: r.id,
      })
    }
    if (r.type === 'level') issues.push(...levelIssues(name, r.scale, r.min, r.id))

    if (r.type === 'alternatives') {
      const alts = r.alternatives ?? []
      if (alts.length === 0) {
        issues.push({ level: 'warn', message: `${name}: 택1 시험 항목이 비어 있어요.`, requirementId: r.id })
      } else if ((r.pick ?? 1) > alts.length) {
        issues.push({
          level: 'warn',
          message: `${name}: 충족 개수(${r.pick})가 시험 항목 수(${alts.length})보다 많아 절대 충족되지 않아요.`,
          requirementId: r.id,
        })
      }
      for (const a of alts) {
        const an = `${name}의 '${a.label || a.id}'`
        if (a.type === 'level') issues.push(...levelIssues(an, a.scale, a.min, r.id))
        if (a.type === 'score' && typeof a.min !== 'number') {
          issues.push({ level: 'warn', message: `${an}: 기준 점수가 비어 있어요.`, requirementId: r.id })
        }
      }
    }

    if (r.type === 'courseGroupPick') {
      const groups = r.groups ?? []
      if (groups.length === 0) {
        issues.push({ level: 'warn', message: `${name}: 과목군이 비어 있어요.`, requirementId: r.id })
      } else if ((r.pick ?? 1) > groups.length) {
        issues.push({
          level: 'warn',
          message: `${name}: 이수 과목군 수(${r.pick})가 실제 과목군(${groups.length})보다 많아 충족되지 않아요.`,
          requirementId: r.id,
        })
      }
    }
  }

  return issues
}

/**
 * level 유형의 스케일·기준 검증. scale이 없거나 기준이 스케일 밖이면 엔진이 무입력에도
 * 충족으로 새므로(check.ts 방어와 짝) 저장을 막는 error로 잡는다.
 */
function levelIssues(
  name: string,
  scale: string[] | undefined,
  min: number | string | undefined,
  requirementId: string,
): ReqSetIssue[] {
  if (!scale || scale.length === 0) {
    return [{ level: 'error', message: `${name}: 등급 단계(scale)가 비어 있어요. 등급 목록을 채워주세요.`, requirementId }]
  }
  if (min == null || !scale.includes(String(min))) {
    return [{ level: 'error', message: `${name}: 기준 등급이 등급 목록에 없어요.`, requirementId }]
  }
  return []
}

export function hasBlockingIssues(issues: ReqSetIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

// ────────────────────────────────────────────────────────────
// 비교과 진행 상태(NonCurricularState) 입력 — 요건 탭 체크리스트용
// ────────────────────────────────────────────────────────────

/** 요건 id의 현재 진행 입력(없으면 빈 객체). */
export function ncEntry(state: NonCurricularState, reqId: string): NonCurricularState[string] {
  return state[reqId] ?? {}
}

/** 요건 진행 입력을 병합 갱신. */
export function setNcEntry(
  state: NonCurricularState,
  reqId: string,
  patch: Partial<NonCurricularState[string]>,
): NonCurricularState {
  return { ...state, [reqId]: { ...(state[reqId] ?? {}), ...patch } }
}

/** alternatives 요건의 하위 항목(시험) 입력을 병합 갱신. */
export function setNcAlternative(
  state: NonCurricularState,
  reqId: string,
  altId: string,
  patch: Partial<{ done?: boolean; score?: number; level?: string }>,
): NonCurricularState {
  const entry = state[reqId] ?? {}
  const alts = entry.alternatives ?? {}
  return {
    ...state,
    [reqId]: {
      ...entry,
      alternatives: { ...alts, [altId]: { ...(alts[altId] ?? {}), ...patch } },
    },
  }
}

/**
 * alternatives 요건에서 하위 항목(시험) 하나를 통째로 제거.
 * 남는 항목이 없으면 alternatives 키 자체를 지워 빈 객체가 쌓이지 않게 한다.
 * (사용자가 고른 어학 시험 한 줄을 삭제하는 데 쓴다.)
 */
export function removeNcAlternative(
  state: NonCurricularState,
  reqId: string,
  altId: string,
): NonCurricularState {
  const entry = state[reqId]
  if (!entry?.alternatives || !(altId in entry.alternatives)) return state
  const rest = { ...entry.alternatives }
  delete rest[altId]
  const nextEntry = { ...entry }
  if (Object.keys(rest).length > 0) nextEntry.alternatives = rest
  else delete nextEntry.alternatives
  return { ...state, [reqId]: nextEntry }
}
