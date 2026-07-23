/**
 * 테스트 transcript 빌더.
 *
 * 10.1 공통 전제(모든 영역·필수·비교과 충족, 전부 completed A0)를 만족하는
 * 기준 상태를 만들고, 각 테스트가 이를 변형한다.
 */

import type {
  AdditionalMajorRule,
  Course,
  CourseState,
  Grade,
  NonCurricularState,
  Profile,
} from '../../types.js'
import { CATALOG } from './catalog.js'
import { ADVANCED_SET, GENERAL_SET } from './reqsets.js'

const CREDITS = new Map(CATALOG.map((e) => [e.courseKey, e.credits]))

let seq = 0
function nextId(): string {
  seq += 1
  return `c${seq}`
}

export interface MkOpts {
  state?: CourseState
  grade?: Grade | null
  credits?: number
  semester?: string
  retakeOf?: string | null
  bucketOverride?: string | null
  countsToward?: string[]
  courseKey?: string | null
  nameSnapshot?: string
  isPassFail?: boolean
  id?: string
}

/** 카탈로그 기본 학점을 쓰되 옵션으로 덮어쓸 수 있는 수강 기록 생성기. */
export function mk(courseKey: string | null, opts: MkOpts = {}): Course {
  const credits = opts.credits ?? (courseKey ? CREDITS.get(courseKey) ?? 3 : 3)
  return {
    id: opts.id ?? nextId(),
    semester: opts.semester ?? '2024-1',
    courseKey: opts.courseKey !== undefined ? opts.courseKey : courseKey,
    nameSnapshot: opts.nameSnapshot ?? courseKey ?? '(미입력)',
    credits,
    state: opts.state ?? 'completed',
    grade: opts.grade !== undefined ? opts.grade : 'A0',
    ...(opts.isPassFail ? { isPassFail: true } : {}),
    ...(opts.retakeOf ? { retakeOf: opts.retakeOf } : {}),
    ...(opts.bucketOverride ? { bucketOverride: opts.bucketOverride } : {}),
    ...(opts.countsToward ? { countsToward: opts.countsToward } : {}),
  }
}

/** 같은 courseKey를 n개 복제(학점 채움용). 각 레코드는 고유 id. */
export function fill(courseKey: string, n: number, opts: MkOpts = {}): Course[] {
  return Array.from({ length: n }, () => mk(courseKey, opts))
}

// ────────────────────────────────────────────────────────────
// 프로필
// ────────────────────────────────────────────────────────────

export function advancedProfile(over: Partial<Profile> = {}): Profile {
  return {
    schemaVersion: 2,
    admissionYear: 2021,
    college: '소프트웨어융합대학',
    department: '소프트웨어학과',
    trackType: 'advanced',
    requirementSetId: ADVANCED_SET.id,
    additionalMajors: [],
    exemptions: [],
    currentSemester: '2026-1',
    targetGraduation: '2026-2',
    onboardingCompleted: true,
    ...over,
  }
}

export function generalProfile(over: Partial<Profile> = {}): Profile {
  return {
    ...advancedProfile(),
    trackType: 'general',
    requirementSetId: GENERAL_SET.id,
    ...over,
  }
}

// ────────────────────────────────────────────────────────────
// 비교과 상태
// ────────────────────────────────────────────────────────────

/** 심화과정 인증 3종 + 영어 인증을 모두 충족하는 상태. */
export function advancedNonCurricular(): NonCurricularState {
  return {
    english_cert: { alternatives: { opic: { level: 'IL' } } },
    major_ability: { count: 2 },
    programming_cert: { alternatives: { topcit: { score: 190 } } },
  }
}

/** 영어 인증만 충족(일반과정은 인증 3종 비활성). */
export function generalNonCurricular(): NonCurricularState {
  return { english_cert: { alternatives: { opic: { level: 'IL' } } } }
}

// ────────────────────────────────────────────────────────────
// 기준 transcript
// ────────────────────────────────────────────────────────────

/** 대학필수 + 학과필수 + 전공필수(공통). */
export function commonRequired(): Course[] {
  return [
    mk('GE-AJOU-CHARACTER'),
    mk('GE-ENGLISH-1'),
    mk('GE-ENGLISH-2'),
    mk('GE-WRITING'),
    mk('GE-AREA-HIST'),
    mk('GE-AREA-ART'),
    mk('GE-AREA-SOC'),
    mk('SW-CAREER-SEMINAR'),
    mk('MATH-1'),
    mk('MATH-2'),
    mk('MATH-PROB-1'),
    mk('MATH-LINEAR-1'), // 택1
    mk('SCI-PHYSICS'),
    mk('SCI-PHYSICS-LAB'), // 실험 짝 일치
    mk('SCI-CHEMISTRY'),
    // 전공필수 11과목
    mk('SW-PROGRAMMING'),
    mk('SW-DISCRETE-MATH'),
    mk('SW-CREATIVE-SW-INTRO'),
    mk('SW-DIGITAL-CIRCUIT'),
    mk('SW-OOP'),
    mk('SW-DATA-STRUCT'),
    mk('SW-COMP-ARCH'),
    mk('SW-SYS-PROGRAMMING'),
    mk('SW-ALGORITHM'),
    mk('SW-NETWORK'),
    mk('SW-OS'),
  ]
}

/**
 * 심화과정 기준 transcript — 정확히 140학점, 모든 축 충족.
 * 전공선택 37 = 캡스톤 3 + 자기주도 3 + 채움 30 + 1학점 채움 = 37 (산학 2군 충족)
 * 일반선택 28 = 채움 27 + 1학점 채움
 */
export function baseAdvancedCourses(): Course[] {
  return [
    ...commonRequired(),
    mk('SW-CAPSTONE'),
    mk('SW-SELF-PROJECT'),
    ...fill('SW-EFILL', 10),
    mk('SW-EFILL-1'),
    ...fill('GE-FILL', 9),
    mk('GE-FILL-1'),
  ]
}

export function baseAdvanced() {
  return {
    profile: advancedProfile(),
    requirementSet: ADVANCED_SET,
    catalog: CATALOG,
    courses: baseAdvancedCourses(),
    nonCurricularState: advancedNonCurricular(),
    additionalMajorRules: [] as AdditionalMajorRule[],
  }
}

/**
 * 일반과정 기준 transcript — 140학점.
 * 전공선택 10 + 일반선택 55 (= 140 − 85 필수).
 * minor 옵션: 일반선택 중 minorCredits만큼을 추가 전공 인정 과목으로 태깅.
 */
export function baseGeneralCourses(opts: { minorTag?: string; minorCredits?: number } = {}): Course[] {
  const minorCredits = opts.minorCredits ?? 0
  const minorCourses = opts.minorTag
    ? fill('MINOR-FILL', minorCredits / 3, { countsToward: [opts.minorTag] })
    : []
  const remainingGeneral = 55 - minorCredits // MINOR-FILL은 3학점 단위
  const fill3 = Math.floor((remainingGeneral - 1) / 3)
  const genFillers = [...fill('GE-FILL', fill3), mk('GE-FILL-1')]
  // remainingGeneral = fill3*3 + 1
  return [
    ...commonRequired(),
    ...fill('SW-EFILL', 3),
    mk('SW-EFILL-1'), // 전공선택 10
    ...minorCourses,
    ...genFillers,
  ]
}

export function baseGeneral(opts: { profile?: Partial<Profile>; minorTag?: string; minorCredits?: number } = {}) {
  return {
    profile: generalProfile(opts.profile),
    requirementSet: GENERAL_SET,
    catalog: CATALOG,
    courses: baseGeneralCourses({
      ...(opts.minorTag ? { minorTag: opts.minorTag } : {}),
      ...(opts.minorCredits ? { minorCredits: opts.minorCredits } : {}),
    }),
    nonCurricularState: generalNonCurricular(),
    additionalMajorRules: [] as AdditionalMajorRule[],
  }
}
