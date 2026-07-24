/**
 * majorPolicy.countsByType(유형별 최소 개수 대안 경로) — 데이터_정정_백로그.md #5 / TASKS R3d.
 *
 * 2025 요람부터 전공 이수원칙이 "전공심화과정 이수 또는 복수(부)전공 이수 또는
 * 마이크로전공 2개 이상 이수"로 확장됐다(학사운영규칙 2-1-2 제20조3항, 신설 2025.04.03).
 * 계약:
 *  - countsByType은 satisfiesMajorPolicy와 무관하게 해당 유형의 완성된 추가전공을 센다.
 *  - 같은 규칙 id의 중복 등록은 1개로 센다(같은 전공 두 번 등록 ≠ 2개).
 *  - 기존 minAdditionalMajorCount 경로(byCount)와 OR 결합 — 어느 쪽이든 충족이면 충족.
 */

import { describe, it, expect } from 'vitest'
import { checkMajorPolicy, evaluate } from '../index.js'
import type { AdditionalMajorResult, AdditionalMajorRule, MajorPolicy } from '../types.js'
import { generalProfile, mk } from './fixtures/builders.js'
import {
  additionalMajorRules2025Sw,
  catalog2025Sw,
  reqSet2025SwGeneral,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'

// ────────────────────────────────────────────────────────────
// 단위 — checkMajorPolicy
// ────────────────────────────────────────────────────────────

const POLICY: MajorPolicy = {
  satisfiedBy: ['advanced_track', 'additional_major'],
  minAdditionalMajorCount: 1,
  countsByType: { micro_degree: 2 },
  requiredWhen: null,
  exemptions: [],
}

function amResult(
  id: string,
  type: AdditionalMajorRule['type'],
  satisfied: boolean,
  satisfiesMajorPolicy = false
): AdditionalMajorResult {
  return {
    id,
    name: id,
    type,
    typeLabel: type === 'micro_degree' ? '마이크로전공' : '복수전공',
    earned: 0,
    required: 9,
    satisfied,
    satisfiesMajorPolicy,
    groupProgress: [],
  }
}

describe('countsByType — 단위(checkMajorPolicy)', () => {
  const profile = generalProfile()

  it('마이크로전공 2개 완성 → 충족 (satisfiesMajorPolicy:false여도)', () => {
    const r = checkMajorPolicy(POLICY, profile, [
      amResult('am_micro_a', 'micro_degree', true),
      amResult('am_micro_b', 'micro_degree', true),
    ])
    expect(r.satisfied).toBe(true)
    expect(r.reason).toBe('마이크로전공 2개 이상 이수로 충족')
  })

  it('마이크로전공 1개(또는 1개만 완성) → 미충족', () => {
    for (const results of [
      [amResult('am_micro_a', 'micro_degree', true)],
      [amResult('am_micro_a', 'micro_degree', true), amResult('am_micro_b', 'micro_degree', false)],
    ]) {
      expect(checkMajorPolicy(POLICY, profile, results).satisfied).toBe(false)
    }
  })

  it('같은 규칙 id 중복 등록은 1개로 센다', () => {
    const r = checkMajorPolicy(POLICY, profile, [
      amResult('am_micro', 'micro_degree', true),
      amResult('am_micro', 'micro_degree', true),
    ])
    expect(r.satisfied).toBe(false)
  })

  it('다른 유형은 세지 않는다 (트랙 2개 ≠ 마이크로 2개)', () => {
    const r = checkMajorPolicy(POLICY, profile, [
      amResult('am_track_a', 'track', true),
      amResult('am_track_b', 'track', true),
    ])
    expect(r.satisfied).toBe(false)
  })

  it('기존 byCount 경로는 그대로 — 복수전공 1개(satisfiesMajorPolicy:true)로 충족', () => {
    const r = checkMajorPolicy(POLICY, profile, [
      amResult('am_double', 'double_major', true, true),
    ])
    expect(r.satisfied).toBe(true)
    expect(r.reason).toBe('복수/부전공 이수로 충족')
  })

  it('countsByType 없는 정책은 기존 동작 유지 (마이크로 2개여도 미충족)', () => {
    const legacy: MajorPolicy = { ...POLICY, countsByType: undefined }
    const r = checkMajorPolicy(legacy, profile, [
      amResult('am_micro_a', 'micro_degree', true),
      amResult('am_micro_b', 'micro_degree', true),
    ])
    expect(r.satisfied).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
// 통합 — 2025 SW general 세트 실데이터
// ────────────────────────────────────────────────────────────

describe('countsByType — 통합(2025 SW general)', () => {
  // 두 번째 마이크로전공: 온보딩 "직접 추가"/규칙 스냅샷 경로로 생기는 별도 규칙.
  const secondMicro: AdditionalMajorRule = {
    id: 'am_micro_2',
    name: '인공지능 마이크로전공',
    type: 'micro_degree',
    typeLabel: '마이크로전공',
    totalMinCredits: 9,
    homeOverlapCap: 3,
    satisfiesMajorPolicy: false,
  }
  const rules = [...additionalMajorRules2025Sw, secondMicro]
  const catalog = catalogFor(catalog2025Sw, 2025, reqSet2025SwGeneral)

  const micro = (ruleId: string, i: number) =>
    mk(null, { nameSnapshot: `${ruleId}-${i}`, credits: 3, countsToward: [ruleId] })

  function run(activeRuleIds: string[], courses = activeRuleIds.flatMap((id) => [1, 2, 3].map((i) => micro(id, i)))) {
    return evaluate({
      profile: generalProfile({
        admissionYear: 2025,
        college: '소프트웨어융합대학',
        requirementSetId: reqSet2025SwGeneral.id,
        additionalMajors: activeRuleIds.map((ruleId) => ({ ruleId, active: true })),
      }),
      courses,
      requirementSet: reqSet2025SwGeneral,
      catalog,
      additionalMajorRules: rules,
      nonCurricularState: {},
    })
  }

  it('세트 데이터에 countsByType이 실려 있다', () => {
    expect(reqSet2025SwGeneral.majorPolicy?.countsByType).toEqual({ micro_degree: 2 })
  })

  it('마이크로전공 2개(각 9학점) 완성 → 전공 이수원칙 충족', () => {
    const r = run(['am_micro', 'am_micro_2'])
    expect(r.additionalMajors.filter((m) => m.satisfied)).toHaveLength(2)
    expect(r.majorPolicy.required).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.majorPolicy.reason).toBe('마이크로전공 2개 이상 이수로 충족')
    expect(r.blockers.some((b) => b.category === 'major_policy')).toBe(false)
  })

  it('마이크로전공 1개만 완성 → 원칙 미충족(major_policy blocker)', () => {
    const r = run(['am_micro'])
    expect(r.majorPolicy.satisfied).toBe(false)
    expect(r.blockers.some((b) => b.category === 'major_policy')).toBe(true)
  })
})
