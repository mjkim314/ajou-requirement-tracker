/**
 * 과목 도메인 헬퍼 (순수).
 *
 * 학기 파싱·정렬, 상태/성적 라벨, 영역(bucket) 프리뷰, 폼 초안 ↔ Course 변환·검증.
 * 계산 로직은 엔진 모듈(resolveBucketCandidates)을 재사용한다 — 컴포넌트에서 재구현하지 않는다.
 * React·localStorage·Date를 참조하지 않으므로 화면 없이 테스트할 수 있다.
 */

import type {
  CatalogEntry,
  Course,
  CourseState,
  Grade,
  RequirementSet,
} from '../engine/index'
import {
  analyzeEquivalents,
  computeEffectiveKeys,
  findFallbackBucketId,
  resolveBucketCandidates,
} from '../engine/index'

// ────────────────────────────────────────────────────────────
// 학기
// ────────────────────────────────────────────────────────────

export interface ParsedSemester {
  year: number
  /** '1' | '2' | 'S'(계절). */
  slot: string
}

const SEMESTER_RE = /^(\d{4})-([12S])$/

/** 학기 표기 정규화 — 앞뒤 공백 제거 + 대문자화(계절 's' → 'S'). 검증·저장 전에 통과시킨다. */
export function normalizeSemester(sem: string): string {
  return sem.trim().toUpperCase()
}

export function parseSemester(sem: string): ParsedSemester | null {
  const m = SEMESTER_RE.exec(normalizeSemester(sem))
  if (!m) return null
  return { year: Number(m[1]), slot: m[2]! }
}

export function isValidSemester(sem: string): boolean {
  return SEMESTER_RE.test(normalizeSemester(sem))
}

const SLOT_RANK: Record<string, number> = { '1': 0, S: 1, '2': 2 }
const SLOT_LABEL: Record<string, string> = { '1': '1학기', '2': '2학기', S: '계절학기' }

/** 정렬 키(오름차순). 파싱 실패한 학기는 맨 뒤로. */
export function semesterSortKey(sem: string): number {
  const p = parseSemester(sem)
  if (!p) return Number.POSITIVE_INFINITY
  return p.year * 3 + (SLOT_RANK[p.slot] ?? 0)
}

/** 표시 라벨: "2022-1" → "2022년 1학기". 알 수 없으면 원문. */
export function semesterLabel(sem: string): string {
  const p = parseSemester(sem)
  if (!p) return sem || '학기 미지정'
  return `${p.year}년 ${SLOT_LABEL[p.slot] ?? p.slot}`
}

// ────────────────────────────────────────────────────────────
// 상태 · 성적
// ────────────────────────────────────────────────────────────

/** 성적으로 학점·평점을 만드는 상태(성적 입력 노출 대상). */
export const GRADED_STATES: CourseState[] = ['completed', 'retake_planned']

export interface StateOption {
  value: CourseState
  label: string
  desc: string
}

/** 폼에 노출하는 상태(설계상 5종). dropped는 폼에서 다루지 않는다. */
export const STATE_OPTIONS: StateOption[] = [
  { value: 'completed', label: '완료', desc: '성적이 나온 이수 과목' },
  { value: 'enrolled', label: '수강중', desc: '이번 학기 수강 중 — ‘완료 예정’ 판정에만 반영' },
  { value: 'planned', label: '예정', desc: '앞으로 들을 계획 — 계산에는 아직 반영 안 됨' },
  { value: 'retake_planned', label: '재수강', desc: '재수강 예정·진행 중 — 이전 성적을 유지하다가 완료 시 갱신' },
  { value: 'credited', label: '편입인정', desc: '편입·전과 등으로 인정된 학점 — 학점만 반영, 평점 제외' },
]

export const STATE_LABEL: Record<CourseState, string> = {
  planned: '예정',
  enrolled: '수강중',
  completed: '완료',
  retake_planned: '재수강',
  dropped: '철회',
  transferred: '편입인정',
  credited: '편입인정',
}

/** 성적 선택지(4.5 척도 + P/NP). 평점 수치는 요건 세트의 gradePoints가 정한다. */
export const GRADE_OPTIONS: Grade[] = [
  'A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P', 'NP',
]

// ────────────────────────────────────────────────────────────
// 학기별 그룹
// ────────────────────────────────────────────────────────────

export interface SemesterGroup {
  semester: string
  label: string
  courses: Course[]
  /** 이 학기 이수 인정 학점 합(엔진 countsForCredit 기준). */
  credits: number
}

/**
 * 학기별로 묶어 최신 학기부터 내림차순. 학기 안은 과목명 가나다순.
 * 재수강으로 대체된(다른 과목의 retakeOf가 가리키는) 이전 기록도 그대로 보여준다
 * — 사용자가 자기 이력을 확인할 수 있어야 하고, 계산에서만 제외된다.
 *
 * 학점 합은 상태를 앱에서 재판정하지 않고 **엔진이 이수로 인정한 과목만** 더한다
 * (countsForCredit 콜백 = result.resolved 기준). 이렇게 해야 F·NP·수강중·대체된 과목이
 * 요약 도넛과 동일하게 제외돼 학기 헤더 합계가 총 이수학점과 어긋나지 않는다(아키텍처 규칙 1).
 */
export function groupBySemester(
  courses: Course[],
  countsForCredit: (course: Course) => boolean,
): SemesterGroup[] {
  const byId = new Map<string, Course[]>()
  for (const c of courses) {
    const key = c.semester || ''
    const list = byId.get(key)
    if (list) list.push(c)
    else byId.set(key, [c])
  }
  const groups: SemesterGroup[] = []
  for (const [semester, list] of byId) {
    const sorted = [...list].sort((a, b) =>
      a.nameSnapshot < b.nameSnapshot ? -1 : a.nameSnapshot > b.nameSnapshot ? 1 : 0,
    )
    const credits = sorted.reduce((sum, c) => (countsForCredit(c) ? sum + c.credits : sum), 0)
    groups.push({ semester, label: semesterLabel(semester), courses: sorted, credits })
  }
  groups.sort((a, b) => semesterSortKey(b.semester) - semesterSortKey(a.semester))
  return groups
}

// ────────────────────────────────────────────────────────────
// 영역(bucket)
// ────────────────────────────────────────────────────────────

export function catalogByKey(catalog: CatalogEntry[]): Map<string, CatalogEntry> {
  return new Map(catalog.map((e) => [e.courseKey, e]))
}

export function bucketLabel(reqSet: RequirementSet, bucketId: string | null | undefined): string {
  if (!bucketId) return '미분류'
  return reqSet.buckets.find((b) => b.id === bucketId)?.label ?? bucketId
}

/**
 * 폼 프리뷰용 귀속 영역. 엔진과 동일한 우선순위(사용자 지정 → 요건 세트 requiredCourses →
 * choiceGroups → 대체 규칙 → 카탈로그 → 폴백)를 재사용한다. 대체 규칙(equivalents, 4순위)도
 * 엔진과 같은 computeEffectiveKeys로 반영해 폼의 '자동 분류' 힌트가 목록(엔진 resolved)과 어긋나지
 * 않게 한다. 다만 동률 tie-break(running 이수학점 기준)는 전체 맥락이 필요하므로 프리뷰에선
 * 첫 후보로 근사한다 — 최종 판정은 저장 후 evaluate()가 정확히 다시 계산한다.
 */
export function previewBucketId(
  opts: { courseKey: string | null; bucketOverride: string | null },
  catalog: Map<string, CatalogEntry>,
  reqSet: RequirementSet,
  admissionYear = 0,
): string | undefined {
  const entry = opts.courseKey ? catalog.get(opts.courseKey) ?? null : null
  let effectiveKeys = opts.courseKey ? [opts.courseKey] : []
  if (opts.courseKey && (reqSet.equivalents?.length ?? 0) > 0) {
    const analysis = analyzeEquivalents(reqSet.equivalents ?? [], admissionYear)
    effectiveKeys = computeEffectiveKeys(opts.courseKey, analysis).keys
  }
  const cand = resolveBucketCandidates(
    { bucketOverride: opts.bucketOverride, courseKey: opts.courseKey, effectiveKeys, catalog: entry },
    reqSet,
    findFallbackBucketId(reqSet),
  )
  return cand.candidates[0]
}

// ────────────────────────────────────────────────────────────
// 폼 초안 ↔ Course
// ────────────────────────────────────────────────────────────

export interface CourseDraft {
  courseKey: string | null
  nameSnapshot: string
  credits: number | null
  semester: string
  state: CourseState
  grade: Grade | null
  /** 사용자가 영역을 직접 지정했을 때만 채운다(자동 귀속과 다를 때). */
  bucketOverride: string | null
  /** 재수강일 때 대체하는 이전 기록 id. */
  retakeOf: string | null
  /**
   * 추가전공 인정 태그(primary + 추가전공 ruleId/type). 폼 UI로는 아직 편집하지 않지만,
   * 편집 저장 시 소실되면 엔진의 추가전공·전공이수원칙 판정 입력이 사라지므로 반드시 통과시킨다.
   */
  countsToward: string[] | null
  memo: string | null
}

export function blankDraft(semester: string): CourseDraft {
  return {
    courseKey: null,
    nameSnapshot: '',
    credits: null,
    semester,
    state: 'completed',
    grade: null,
    bucketOverride: null,
    retakeOf: null,
    countsToward: null,
    memo: null,
  }
}

export function courseToDraft(c: Course): CourseDraft {
  return {
    courseKey: c.courseKey,
    nameSnapshot: c.nameSnapshot,
    credits: c.credits,
    semester: c.semester,
    state: c.state,
    grade: c.grade ?? null,
    bucketOverride: c.bucketOverride ?? null,
    retakeOf: c.retakeOf ?? null,
    countsToward: c.countsToward ?? null,
    memo: c.memo ?? null,
  }
}

export interface DraftErrors {
  nameSnapshot?: string
  credits?: string
  semester?: string
  grade?: string
  bucketOverride?: string
  retakeOf?: string
}

/**
 * 초안 검증. courseKey가 없는(카탈로그 미확인) 과목은 영역을 사용자가 직접 골라야 한다.
 * 성적/재수강 연결은 상태에 따라 필수가 된다.
 */
export function validateDraft(draft: CourseDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (draft.nameSnapshot.trim().length === 0) errors.nameSnapshot = '과목명을 입력하세요.'
  if (draft.credits == null || !Number.isFinite(draft.credits) || draft.credits <= 0) {
    errors.credits = '학점을 1 이상으로 입력하세요.'
  }
  if (!isValidSemester(draft.semester)) errors.semester = '학기를 2022-1 · 2022-S 형식으로 입력하세요.'
  if (GRADED_STATES.includes(draft.state) && draft.grade == null) {
    errors.grade = '성적을 선택하세요.'
  }
  if (draft.state === 'retake_planned' && !draft.retakeOf) {
    errors.retakeOf = '대체할 이전 과목을 선택하세요.'
  }
  // 카탈로그에 없는 과목은 자동 귀속이 불가하므로 영역을 직접 지정해야 한다.
  if (draft.courseKey == null && !draft.bucketOverride) {
    errors.bucketOverride = '카탈로그에 없는 과목은 영역을 직접 골라주세요.'
  }
  return errors
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * 검증을 통과한 초안 → Course. id는 호출부(AppState)가 채운다.
 * 상태에 따라 무의미한 필드는 정리한다(예: 성적 없는 상태의 grade 제거).
 */
export function draftToCourse(draft: CourseDraft, id: string): Course {
  const graded = GRADED_STATES.includes(draft.state)
  const grade = graded ? draft.grade ?? null : null
  const course: Course = {
    id,
    semester: normalizeSemester(draft.semester),
    courseKey: draft.courseKey,
    nameSnapshot: draft.nameSnapshot.trim(),
    credits: draft.credits ?? 0,
    state: draft.state,
    grade,
    isPassFail: grade === 'P' || grade === 'NP',
    retakeOf: draft.state === 'retake_planned' || draft.retakeOf ? draft.retakeOf : null,
    bucketOverride: draft.bucketOverride,
    // 추가전공 인정 태그를 편집 왕복에서 보존(폼 미노출이어도 소실 금지).
    countsToward: draft.countsToward ?? undefined,
    memo: draft.memo && draft.memo.trim().length > 0 ? draft.memo.trim() : null,
  }
  return course
}
