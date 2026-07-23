/**
 * 계산 엔진 도메인 타입.
 *
 * 설계명세서 v0.2 5장(데이터 모델)·7장(계산 엔진)을 그대로 옮긴 타입 정의.
 * 이 파일은 값을 하나도 담지 않는다 — 요건 숫자는 전부 RequirementSet(데이터)에서 온다.
 */

// ────────────────────────────────────────────────────────────
// 과목 식별 · 카탈로그
// ────────────────────────────────────────────────────────────

/** 성적. completed 과목에만 의미가 있다. */
export type Grade =
  | 'A+'
  | 'A0'
  | 'B+'
  | 'B0'
  | 'C+'
  | 'C0'
  | 'D+'
  | 'D0'
  | 'F'
  | 'P'
  | 'NP'

/** 등급 → 평점 환산표. 기본 4.5 만점이나 요건 세트에서 덮어쓸 수 있다. */
export type GradePointTable = Partial<Record<Grade, number>>

export type BucketGroup =
  | 'university_required' // 대학필수
  | 'department_required' // 학과필수
  | 'major' // 전공 (전공 평점 대상)
  | 'free' // 자유 이수

export interface CatalogEntry {
  /** 앱 내부 불변 기본키. 모든 참조가 이 값을 쓴다. */
  courseKey: string
  name: string
  nameEn?: string
  /** 검색·정규화 대상 이표기(구명칭·영문명·철자 흔들림). */
  aliases?: string[]
  /** 학교 학수번호. 1:1이 아니므로 배열(중복·복수 부여 대응). */
  codes?: string[]
  credits: number
  creditBreakdown?: { theory?: number; design?: number; lab?: number }
  /** 어디에도 안 걸리면 귀속될 기본 영역 ID. */
  defaultBucket: string
  prerequisites?: string[]
  offeredSemesters?: string[]
  offeredYear?: number
  department?: string
  college?: string
  gradingType?: 'ABCDF' | 'ABF' | 'ABCF' | 'PF'
  /** 추가 전공·산학프로젝트 판정용 과목군 소속. */
  courseGroups?: string[]
  /** 영역별교양 하위 영역 ID (minDistinctAreas 판정용). */
  area?: string
  active?: boolean
  note?: string | null
}

// ────────────────────────────────────────────────────────────
// 요건 세트 (Bucket / Requirement / Equivalent / CourseGroup)
// ────────────────────────────────────────────────────────────

export interface ChoiceGroup {
  id: string
  label: string
  /** 이 그룹에서 골라야 하는 과목 수. */
  pick: number
  courses: string[]
  /** 다른 그룹 선택과 연동(예: 물리학실험은 물리학과 짝). */
  linkedTo?: string | null
}

export interface AreaSpec {
  id: string
  label: string
  minCourses: number
}

export interface Bucket {
  id: string
  label: string
  /** 요약 화면 blocker 문구용 짧은 이름(예: "전필"). 없으면 label 사용. */
  shortLabel?: string
  group: BucketGroup
  minCredits: number
  requiredCourses?: string[]
  choiceGroups?: ChoiceGroup[]
  /** 서로 다른 영역 최소 개수(영역별교양). */
  minDistinctAreas?: number | null
  areas?: AreaSpec[]
  /** 이 영역으로 인정 가능한 학점 상한. */
  creditCap?: number | null
  /** 상한 초과분 이월 대상 영역 ID. */
  overflowTo?: string | null
  /** 총 이수학점 합산 여부. 기본 true. */
  countsTowardTotal?: boolean
}

/** appliesWhen 조건식. profile의 field를 op로 value와 비교. */
export interface Condition {
  field: 'trackType' | string
  op: 'eq' | 'neq'
  value: unknown
}

export type RequirementType =
  | 'check'
  | 'score'
  | 'count'
  | 'level'
  | 'alternatives'
  | 'courseGroupPick'

export interface RequirementAlternative {
  id: string
  label: string
  type: 'check' | 'score' | 'level'
  min?: number | string
  unit?: string
  /** 등급형 시험의 등급 스케일(인덱스 비교). */
  scale?: string[]
}

export interface RequirementGroup {
  id: string
  label: string
  courses: string[]
}

/** 비교과·인증 요건. */
export interface Requirement {
  id: string
  label: string
  /** blocker 문구용 짧은 이름(예: "영어 인증"). 없으면 label 사용. */
  shortLabel?: string
  type: RequirementType
  min?: number | string
  unit?: string
  scale?: string[]
  alternatives?: RequirementAlternative[]
  groups?: RequirementGroup[]
  /** alternatives/courseGroupPick에서 충족해야 하는 개수. */
  pick?: number
  /** 조건이 거짓이면 항목 자체가 비활성(미충족 아님). null이면 항상 적용. */
  appliesWhen?: Condition | null
  helpText?: string
  sourceNote?: string
}

export interface EquivalentCourse {
  id: string
  type: 'replaces' | 'sameAs' | 'renamed' | 'substitutable'
  from: string
  to: string
  direction: 'forward' | 'bidirectional'
  creditPolicy?: 'useOriginal' | 'useTarget' | 'min'
  note?: string
  effectiveFrom?: number
}

/** 요건 세트 레벨 과목군(현장실습 상한·이월 등). */
export interface RequirementCourseGroup {
  id: string
  label: string
  courses: string[]
  creditCap?: number | null
  /** 상한을 적용할 영역 ID. */
  capBucket?: string | null
  /** 초과분 이월 대상 영역 ID. */
  overflowTo?: string | null
}

/** 인정학점(교환·현장실습·입학 전 이수 등) 합산 상한. 초과는 경고로만 알린다(판정 불변). */
export interface RecognitionCap {
  id: string
  label: string
  /** 합산 대상 과목 상태. */
  states: CourseState[]
  /** 절대 학점 상한. */
  maxCredits?: number | null
  /** 총 졸업학점 대비 비율 상한(예: 0.5 = 1/2). maxCredits와 함께 있으면 작은 쪽 적용. */
  maxRatioOfTotal?: number | null
  sourceNote?: string
}

export interface MajorPolicy {
  satisfiedBy: string[]
  minAdditionalMajorCount: number
  /** 이 조건이 참일 때만 추가전공이 필수. */
  requiredWhen?: Condition | null
  /** 이 예외를 보유하면 정책 면제. */
  exemptions: string[]
}

export interface RequirementSet {
  schemaVersion: number
  requirementVersion: string
  id: string
  name: string
  admissionYearFrom?: number
  admissionYearTo?: number
  college?: string
  department?: string
  trackType: string
  totalCredits: number
  minGPA: number
  /** 등급 평점표. 없으면 엔진 기본값(4.5 만점) 사용. */
  gradePoints?: GradePointTable
  buckets: Bucket[]
  nonCurricular: Requirement[]
  equivalents?: EquivalentCourse[]
  courseGroups?: RequirementCourseGroup[]
  recognitionCaps?: RecognitionCap[]
  majorPolicy?: MajorPolicy
  createdAt?: string
  updatedAt?: string
  author?: string
  source?: Record<string, unknown>
}

// ────────────────────────────────────────────────────────────
// 추가 전공 규칙
// ────────────────────────────────────────────────────────────

export interface AdditionalMajorGroup {
  id: string
  label: string
  minCredits: number
  creditCap?: number | null
}

export interface AdditionalMajorRule {
  id: string
  name: string
  type:
    | 'double_major'
    | 'minor'
    | 'linked_major'
    | 'track'
    | 'micro_degree'
    | 'self_designed'
    | 'custom'
  typeLabel: string
  totalMinCredits: number
  courseGroups?: AdditionalMajorGroup[]
  /** 제1전공 중복 인정 상한. */
  homeOverlapCap: number
  requiredCourses?: string[]
  eligibility?: {
    excludedColleges?: string[]
    excludedDepartments?: string[]
    appliesToHomeDepartment?: string
  }
  /** 이수해도 전공 이수원칙(축 6)을 충족시키는지. */
  satisfiesMajorPolicy: boolean
  sourceNote?: string
}

// ────────────────────────────────────────────────────────────
// 개인 데이터 (Profile / Course / 비교과 상태)
// ────────────────────────────────────────────────────────────

export type CourseState =
  | 'planned'
  | 'enrolled'
  | 'completed'
  | 'retake_planned'
  | 'dropped'
  | 'transferred'
  | 'credited'

export interface Course {
  id: string
  semester: string
  /** 카탈로그 자동완성으로 확정된 키. 미해석이면 null. */
  courseKey: string | null
  nameSnapshot: string
  credits: number
  state: CourseState
  grade?: Grade | null
  isPassFail?: boolean
  /** 재수강일 때 이전 수강 기록 id. */
  retakeOf?: string | null
  /** 사용자가 직접 지정한 귀속 영역. */
  bucketOverride?: string | null
  /** 인정 전공 배열: "primary" + 추가전공 ruleId/type. */
  countsToward?: string[]
  memo?: string | null
}

export interface Profile {
  schemaVersion: number
  admissionYear: number
  college: string
  department: string
  trackType: string
  requirementSetId: string
  additionalMajors: {
    ruleId: string
    startedAt?: string
    active: boolean
    /**
     * 온보딩에서 사용자가 선택·편집한 규칙 스냅샷(학점·중복상한 등).
     * 있으면 엔진 입력의 규칙 배열에 병합돼, 번들 기본 규칙 대신 이 값으로 판정한다.
     * id는 ruleId와 같게 둔다(엔진 rulesMap 조회 키).
     */
    rule?: AdditionalMajorRule
    /** 표시용 사용자 지정 이름(예: "컴퓨터공학 복수전공"). 없으면 rule.name. */
    displayName?: string
  }[]
  exemptions: string[]
  isTransferStudent?: boolean
  currentSemester?: string
  targetGraduation?: string
  onboardingCompleted?: boolean
}

/** 비교과 요건 진행 상태(요건 id → 사용자 입력). */
export type NonCurricularState = Record<
  string,
  {
    done?: boolean
    score?: number
    level?: string
    count?: number
    /** alternatives 요건의 하위 항목별 입력. */
    alternatives?: Record<
      string,
      { done?: boolean; score?: number; level?: string }
    >
  }
>

// ────────────────────────────────────────────────────────────
// 엔진 입력 / 출력
// ────────────────────────────────────────────────────────────

export interface EvaluationInput {
  profile: Profile
  courses: Course[]
  requirementSet: RequirementSet
  catalog: CatalogEntry[]
  additionalMajorRules?: AdditionalMajorRule[]
  nonCurricularState?: NonCurricularState
}

/** 정규화 + 대체 규칙 적용을 마친 과목. */
export interface ResolvedCourse {
  course: Course
  /** 확정된 courseKey. 미해석이면 null. */
  courseKey: string | null
  /** 요건 매칭에 쓰는 유효 키(자기 자신 + 대체 규칙으로 도달 가능한 키). */
  effectiveKeys: string[]
  catalog: CatalogEntry | null
  /** 학수번호 중복 등으로 후보가 여럿이면 여기 채운다. */
  ambiguousCandidates?: string[]
  /** 카탈로그에서 못 찾음. */
  unmatched: boolean
  /** 대체 규칙으로 인정된 과목. */
  viaEquivalent: boolean
  /** 최종 귀속 영역 ID. */
  bucketId: string
  /** 귀속 우선순위(1~6). 낮을수록 우선. */
  resolutionPriority: number
  /** 집계·평점 반영 여부(state 기준 필터 결과). */
  countsForCredit: boolean
  countsForGPA: boolean
  countsForProjection: boolean
}

export type Severity = 'blocking' | 'pending' | 'warning' | 'info'

export interface Blocker {
  severity: Severity
  category: string
  shortText: string
  detail: string
  bucketId?: string
  requirementId?: string
  actionHint?: string
  resolvableThisSemester?: boolean
  /** 정렬 보조: 해소에 필요한 학점(적을수록 먼저). */
  creditsToResolve?: number
}

export interface BucketResult {
  id: string
  label: string
  group: BucketGroup
  earned: number
  required: number
  rate: number
  satisfied: boolean
  missingCourses: string[]
  /** 미충족 사유(택1 미이수, 영역 부족 등). */
  reasons: string[]
}

export interface NonCurricularResult {
  id: string
  label: string
  active: boolean
  satisfied: boolean
  detail: string
}

export interface AdditionalMajorResult {
  id: string
  name: string
  typeLabel: string
  earned: number
  required: number
  satisfied: boolean
  satisfiesMajorPolicy: boolean
  groupProgress: { id: string; label: string; earned: number; required: number }[]
}

export type Verdict =
  | 'graduatable'
  | 'graduatable_after_current'
  | 'not_graduatable'

export interface EvaluationResult {
  verdict: Verdict
  verdictLabel: string
  completionRate: number
  completionLabel: string

  credits: {
    earned: number
    required: number
    remaining: number
    inProgress: number
    projected: number
  }
  gpa: {
    overall: number
    major: number
    minRequired: number
    satisfied: boolean
  }
  buckets: BucketResult[]
  nonCurricular: NonCurricularResult[]
  additionalMajors: AdditionalMajorResult[]
  majorPolicy: {
    satisfied: boolean
    required: boolean
    reason: string
  }

  blockers: Blocker[]
  warnings: Blocker[]

  plan: {
    remainingCredits: number
    remainingSemesters: number
    perSemester: number
    overloaded: boolean
  }

  /** 검사·디버깅용 부가 정보. */
  resolved: ResolvedCourse[]
  diagnostics: {
    ambiguous: { courseId: string; input: string; candidates: string[] }[]
    unmatched: { courseId: string; input: string }[]
    equivalentCycles: string[]
  }
}
