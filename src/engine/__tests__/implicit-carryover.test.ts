/**
 * 암묵 이월(implicit carryover) — 데이터_정정_백로그.md #10 / TASKS R3a.
 *
 * 전 세트가 Σ버킷 minCredits = totalCredits 구조라, 한 영역을 초과 이수하면
 * 그만큼 일반선택이 비어 "일반선택 N학점 부족"으로 오판됐다. 엔진이 일반선택
 * (group === 'general_elective') 충족 계산에 타 버킷의 minCredits 초과분을
 * 합산한다. 계약:
 *  - bucketEarned·totalEarned는 불변(이중 합산 없음) — earned는 실제 귀속 학점.
 *  - 명시 creditCap/overflowTo로 이동한 분은 초과분으로 다시 잡히지 않는다.
 *  - countsTowardTotal:false 영역의 초과분은 흐르지 않는다.
 *  - 이월이 실제로 쓰일 때만 notes로 사유를 알린다.
 */

import { describe, it, expect } from 'vitest'
import { evaluate } from '../index.js'
import type { Bucket, Course, RequirementSet } from '../types.js'
import { CATALOG } from './fixtures/catalog.js'
import { ADVANCED_SET } from './fixtures/reqsets.js'
import { advancedProfile, mk } from './fixtures/builders.js'

const ME_MIN = ADVANCED_SET.buckets.find((b) => b.id === 'major_elective')!.minCredits
const GE_MIN = ADVANCED_SET.buckets.find((b) => b.id === 'general_elective')!.minCredits

/** 지정 영역에 n학점을 채우는 무명 과목들(3학점 단위 + 나머지). */
function fillBucket(bucketId: string, total: number, label = bucketId): Course[] {
  const out: Course[] = []
  let left = total
  let i = 0
  while (left > 0) {
    const c = Math.min(3, left)
    out.push(mk(null, { nameSnapshot: `${label}${++i}`, credits: c, bucketOverride: bucketId }))
    left -= c
  }
  return out
}

function run(courses: Course[], requirementSet: RequirementSet = ADVANCED_SET) {
  return evaluate({
    profile: advancedProfile(),
    courses,
    requirementSet,
    catalog: CATALOG,
    additionalMajorRules: [],
    nonCurricularState: {},
  })
}

describe('암묵 이월 — 일반선택 충족 계산', () => {
  it('전공선택 초과분이 일반선택 부족을 채운다 (satisfied + carriedIn + 사유)', () => {
    const courses = [
      ...fillBucket('major_elective', ME_MIN + 9, '전선'),
      ...fillBucket('general_elective', GE_MIN - 9, '일선'),
    ]
    const r = run(courses)
    const ge = r.buckets.find((b) => b.id === 'general_elective')!
    expect(ge.earned).toBe(GE_MIN - 9) // earned는 실제 귀속 학점 그대로
    expect(ge.carriedIn).toBe(9)
    expect(ge.satisfied).toBe(true)
    expect(ge.rate).toBe(1)
    expect(ge.notes).toEqual(['전공선택 초과 9학점이 잔여 학점으로 집계됐어요'])
    // 일반선택 부족 blocker가 사라진다
    expect(r.blockers.some((b) => b.bucketId === 'general_elective')).toBe(false)
    // 전공선택 자체는 초과여도 earned 그대로(이월로 깎이지 않음)
    expect(r.buckets.find((b) => b.id === 'major_elective')!.earned).toBe(ME_MIN + 9)
  })

  it('이월이 모자라면 남은 부족분만 정확히 알린다', () => {
    const courses = [
      ...fillBucket('major_elective', ME_MIN + 3, '전선'),
      ...fillBucket('general_elective', GE_MIN - 9, '일선'),
    ]
    const r = run(courses)
    const ge = r.buckets.find((b) => b.id === 'general_elective')!
    expect(ge.satisfied).toBe(false)
    expect(ge.carriedIn).toBe(3)
    expect(ge.reasons).toContain('6학점 부족')
    expect(ge.notes).toEqual(['전공선택 초과 3학점이 잔여 학점으로 집계됐어요'])
    const blocker = r.blockers.find((b) => b.bucketId === 'general_elective')
    expect(blocker?.shortText).toBe('일반선택 6학점 부족')
    expect(blocker?.creditsToResolve).toBe(6)
  })

  it('여러 영역 초과분이 합산되고 사유에 출처별로 나온다', () => {
    const courses = [
      ...fillBucket('major_elective', ME_MIN + 3, '전선'),
      ...fillBucket('math', 12 + 3, '수학'),
      ...fillBucket('general_elective', GE_MIN - 6, '일선'),
    ]
    const r = run(courses)
    const ge = r.buckets.find((b) => b.id === 'general_elective')!
    expect(ge.carriedIn).toBe(6)
    expect(ge.satisfied).toBe(true)
    expect(ge.notes[0]).toContain('수학 초과 3학점')
    expect(ge.notes[0]).toContain('전공선택 초과 3학점')
  })

  it('일반선택이 자력으로 충족이면 사유를 붙이지 않는다', () => {
    const courses = [
      ...fillBucket('major_elective', ME_MIN + 9, '전선'),
      ...fillBucket('general_elective', GE_MIN, '일선'),
    ]
    const ge = run(courses).buckets.find((b) => b.id === 'general_elective')!
    expect(ge.satisfied).toBe(true)
    expect(ge.notes).toEqual([])
  })

  it('이중 계산 가드 — 명시 상한·이월(courseGroup)로 이동한 분은 초과분으로 다시 잡히지 않는다', () => {
    // 현장실습 12학점: 상한 6은 전공선택에 남고 6은 일반선택으로 명시 이월된다.
    // 전공선택 총합을 정확히 min으로 맞추면 암묵 이월분은 0이어야 한다.
    const field = ['SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4'].map((k) =>
      mk(k, { credits: 3 })
    )
    const courses = [
      ...field, // 상한 적용 후 전공선택 6
      ...fillBucket('major_elective', ME_MIN - 6, '전선'),
      ...fillBucket('general_elective', GE_MIN - 6, '일선'), // 명시 이월 6으로 정확히 충족
    ]
    const r = run(courses)
    const ge = r.buckets.find((b) => b.id === 'general_elective')!
    expect(ge.earned).toBe(GE_MIN) // 명시 이월분은 earned에 포함(기존 동작)
    expect(ge.carriedIn).toBe(0) // 암묵 이월은 없다
    expect(ge.satisfied).toBe(true)
    expect(ge.notes).toEqual([])
  })

  it('countsTowardTotal:false 영역의 초과분은 흐르지 않는다', () => {
    const extra: Bucket = {
      id: 'extra_no_total',
      label: '총학점 미산입',
      group: 'university_required',
      minCredits: 0,
      countsTowardTotal: false,
    }
    const set: RequirementSet = { ...ADVANCED_SET, buckets: [...ADVANCED_SET.buckets, extra] }
    const courses = [
      ...fillBucket('extra_no_total', 6, '미산입'),
      ...fillBucket('general_elective', GE_MIN - 6, '일선'),
    ]
    const ge = run(courses, set).buckets.find((b) => b.id === 'general_elective')!
    expect(ge.carriedIn).toBe(0)
    expect(ge.satisfied).toBe(false)
  })

  it('이월은 일반선택으로만 흐른다 — 일반선택 초과가 타 영역 부족을 채우지 않는다', () => {
    const courses = [
      ...fillBucket('general_elective', GE_MIN + 9, '일선'),
      ...fillBucket('major_elective', ME_MIN - 3, '전선'),
    ]
    const me = run(courses).buckets.find((b) => b.id === 'major_elective')!
    expect(me.carriedIn).toBe(0)
    expect(me.satisfied).toBe(false)
  })

  it('수강중 포함(예정) 컨텍스트에도 같은 규칙이 적용된다', () => {
    // 일반선택 6학점이 수강중 — 현재는 이월로도 부족하지만 예정 컨텍스트에선 충족.
    const courses = [
      ...fillBucket('major_elective', ME_MIN + 3, '전선'),
      ...fillBucket('general_elective', GE_MIN - 9, '일선'),
      mk(null, { nameSnapshot: '일선수강중1', credits: 3, bucketOverride: 'general_elective', state: 'enrolled', grade: null }),
      mk(null, { nameSnapshot: '일선수강중2', credits: 3, bucketOverride: 'general_elective', state: 'enrolled', grade: null }),
    ]
    const r = run(courses)
    const blocker = r.blockers.find((b) => b.bucketId === 'general_elective')
    // 현재 부족 3학점(9 부족 - 이월 3 - 수강중 미포함)… 수강중 6학점으로 해소 예정
    expect(blocker?.severity).toBe('pending')
    expect(blocker?.resolvableThisSemester).toBe(true)
  })
})
