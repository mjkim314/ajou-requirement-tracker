/**
 * recognitionCaps(인정학점 합산 상한) 검사 — 데이터_정정_백로그.md #3.
 *
 * 상한 초과는 경고(warning)로만 알리고 verdict·blocker는 바꾸지 않는다.
 * 실제 인정 여부는 학교 판단이라 판정 불변이 계약이다.
 */

import { describe, it, expect } from 'vitest'
import { checkNonCurricular, evaluate } from '../index.js'
import type {
  Course,
  Profile,
  RecognitionCap,
  Requirement,
  RequirementSet,
} from '../types.js'
import { CATALOG } from './fixtures/catalog.js'
import { ADVANCED_SET } from './fixtures/reqsets.js'
import { advancedProfile, mk } from './fixtures/builders.js'

const RATIO_CAP: RecognitionCap = {
  id: 'cap_recognized_credits',
  label: '교환·인정학점 합산 상한',
  states: ['transferred', 'credited'],
  maxRatioOfTotal: 0.5,
}

/** 비율 상한(졸업학점의 1/2). 픽스처 totalCredits 기준으로 계산해 값 하드코딩을 피한다. */
const LIMIT = ADVANCED_SET.totalCredits * 0.5
const LIMIT_STR = String(Math.round(LIMIT * 10) / 10)

function withCaps(caps?: RecognitionCap[]): RequirementSet {
  return caps ? { ...ADVANCED_SET, recognitionCaps: caps } : { ...ADVANCED_SET }
}

function run(requirementSet: RequirementSet, courses: Course[]) {
  return evaluate({
    profile: advancedProfile(),
    courses,
    requirementSet,
    catalog: CATALOG,
    additionalMajorRules: [],
    nonCurricularState: {},
  })
}

function capWarnings(r: ReturnType<typeof run>) {
  return r.warnings.filter((w) => w.category === 'recognition_cap')
}

describe('recognitionCaps', () => {
  it('상한 초과 → recognition_cap 경고 1건', () => {
    const courses = [
      mk(null, { nameSnapshot: '교환인정1', credits: LIMIT, state: 'transferred', grade: null }),
      mk(null, { nameSnapshot: '학점인정1', credits: 3, state: 'credited', grade: null }),
    ]
    const w = capWarnings(run(withCaps([RATIO_CAP]), courses))
    expect(w).toHaveLength(1)
    expect(w[0]!.severity).toBe('warning')
    expect(w[0]!.requirementId).toBe('cap_recognized_credits')
    expect(w[0]!.detail).toContain(`상한 ${LIMIT_STR}학점`)
  })

  it('상한 이하(경계 포함) → 경고 없음', () => {
    const courses = [
      mk(null, { nameSnapshot: '교환인정1', credits: LIMIT, state: 'transferred', grade: null }),
      mk(null, { nameSnapshot: '일반과목', credits: 30, state: 'completed' }),
    ]
    expect(capWarnings(run(withCaps([RATIO_CAP]), courses))).toHaveLength(0)
  })

  it('completed 등 대상 외 상태는 합산하지 않는다', () => {
    const courses = [
      mk(null, { nameSnapshot: '일반과목', credits: LIMIT + 30, state: 'completed' }),
    ]
    expect(capWarnings(run(withCaps([RATIO_CAP]), courses))).toHaveLength(0)
  })

  it('maxCredits 절대 상한 + 비율 상한이 함께면 작은 쪽 적용', () => {
    const cap: RecognitionCap = { ...RATIO_CAP, id: 'cap_abs', maxCredits: 6 }
    const courses = [
      mk(null, { nameSnapshot: '학점인정1', credits: 9, state: 'credited', grade: null }),
    ]
    const w = capWarnings(run(withCaps([cap]), courses))
    expect(w).toHaveLength(1)
    expect(w[0]!.detail).toContain('상한 6학점')
  })

  it('recognitionCaps 없는 세트는 경고 없음(하위 호환)', () => {
    const courses = [
      mk(null, { nameSnapshot: '교환인정1', credits: LIMIT + 10, state: 'transferred', grade: null }),
    ]
    expect(capWarnings(run(withCaps(), courses))).toHaveLength(0)
  })

  it('상한 초과는 verdict·blocker·학점 집계를 바꾸지 않는다(경고 전용)', () => {
    const courses = [
      mk(null, { nameSnapshot: '교환인정1', credits: LIMIT + 10, state: 'transferred', grade: null }),
    ]
    const base = run(withCaps(), courses)
    const capped = run(withCaps([RATIO_CAP]), courses)
    expect(capped.verdict).toBe(base.verdict)
    expect(capped.credits.earned).toBe(base.credits.earned)
    expect(capped.blockers.map((b) => b.category)).toEqual(base.blockers.map((b) => b.category))
  })
})

// ────────────────────────────────────────────────────────────

/**
 * 산학프로젝트(courseGroupPick) — 과목군 멤버십의 두 출처와 수동 확인.
 *
 * 실제 성적증명서 사례: 2021학번이 2025-2에 AI집중교육1·2를 이수. 2021 세트의
 * `intensive` 그룹 목록에는 IT집중교육1·2만 있지만, 카탈로그가 AI집중교육에도
 * `courseGroups: ['intensive']`를 붙여 둔다. 세트 목록만 보면 영영 안 세어진다.
 */
describe('courseGroupPick — 과목군 태그 · 수동 확인', () => {
  const REQ: Requirement = {
    id: 'industry_project',
    label: '산학프로젝트 인증',
    type: 'courseGroupPick',
    pick: 2,
    groups: [
      { id: 'intensive', label: '집중교육과목군', courses: ['IT-1', 'IT-2'] },
      { id: 'capstone', label: '캡스톤디자인과목군', courses: ['CAP'] },
    ],
  }
  const SET = { nonCurricular: [REQ] } as unknown as RequirementSet
  const PROFILE = { trackType: 'advanced' } as unknown as Profile

  const run = (keys: string[], tags: [string, string[]][] = [], state = {}) =>
    checkNonCurricular(SET, state, PROFILE, new Set(keys), new Map(tags))[0]!.satisfied

  it('세트 목록에 있는 과목은 그대로 센다', () => {
    expect(run(['IT-1', 'CAP'])).toBe(true)
    expect(run(['IT-1', 'IT-2'])).toBe(false) // 같은 군 2과목 = 1군
  })

  it('세트 목록에 없어도 카탈로그가 그 과목군으로 태그하면 센다', () => {
    // AI집중교육1이 intensive 태그만 갖고 있어도 집중교육과목군이 충족된다
    expect(run(['AI-1', 'CAP'], [['AI-1', ['intensive']]])).toBe(true)
  })

  it('태그가 있어도 이수하지 않은 과목은 세지 않는다', () => {
    expect(run(['CAP'], [['AI-1', ['intensive']]])).toBe(false)
  })

  it('요건에 없는 과목군 태그는 무시한다', () => {
    // selfresearch 군은 이 요건에 없다 → 세지 않는다
    expect(run(['CAP', 'SR-1'], [['SR-1', ['selfresearch']]])).toBe(false)
  })

  it('pickUnit=course도 태그를 센다', () => {
    const byCourse = { ...REQ, pickUnit: 'course' as const }
    const set = { nonCurricular: [byCourse] } as unknown as RequirementSet
    const r = checkNonCurricular(
      set, {}, PROFILE, new Set(['AI-1', 'AI-2']),
      new Map([['AI-1', ['intensive']], ['AI-2', ['intensive']]]),
    )
    expect(r[0]!.satisfied).toBe(true) // 같은 군 2과목 = 과목 2개
  })

  it('학과 인정 수동 표시는 과목 판정을 건너뛴다', () => {
    expect(run([], [], { industry_project: { done: true } })).toBe(true)
    // done:false는 "아직 안 함"이지 "인정 안 됨"이 아니다 — 자동 충족을 끄지 않는다
    expect(run(['IT-1', 'CAP'], [], { industry_project: { done: false } })).toBe(true)
  })
})
