/**
 * recognitionCaps(인정학점 합산 상한) 검사 — 데이터_정정_백로그.md #3.
 *
 * 상한 초과는 경고(warning)로만 알리고 verdict·blocker는 바꾸지 않는다.
 * 실제 인정 여부는 학교 판단이라 판정 불변이 계약이다.
 */

import { describe, it, expect } from 'vitest'
import { evaluate } from '../index.js'
import type { Course, RecognitionCap, RequirementSet } from '../types.js'
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
