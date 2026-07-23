/**
 * bundleFor / additionalMajorTemplates 폴백 검증 — 데이터_정정_백로그.md #2.
 *
 * 핵심 계약: 비SW 학과 세트에 SW 카탈로그를 조용히 물려주지 않는다(빈 번들 = 카탈로그
 * 미지정). SW 세트·학과 미기재 레거시 세트는 기존처럼 학번으로 카탈로그 연도를 고른다.
 */

import { describe, it, expect } from 'vitest'
import type { RequirementSet } from '../engine/types'
import {
  additionalMajorRules2021Sw,
  additionalMajorRules2022Sw,
  catalog2021Sw,
  catalog2022Sw,
  catalog2023Sw,
  catalog2024Sw,
  reqSet2021SwAdvanced,
} from '../data/index'
import { additionalMajorTemplates, bundleFor, normalizeReqSetGroups } from './dataSources'

function mkSet(over: Partial<RequirementSet>): RequirementSet {
  return {
    schemaVersion: 2,
    requirementVersion: 'test-v1',
    id: 'rs_test',
    name: '테스트 세트',
    trackType: 'advanced',
    totalCredits: 140,
    minGPA: 2,
    buckets: [],
    nonCurricular: [],
    ...over,
  }
}

describe('bundleFor', () => {
  it('등록된 프리셋 id → 해당 번들', () => {
    expect(bundleFor(reqSet2021SwAdvanced).catalog).toBe(catalog2021Sw)
  })

  it('커스텀 세트는 source.basePresetId로 원본 번들', () => {
    const s = mkSet({ id: 'custom_1', source: { basePresetId: 'rs_2022_sw_advanced' } })
    expect(bundleFor(s).catalog).toBe(catalog2022Sw)
  })

  it('SW 세트는 학번으로 폴백(2024+ → 2024, 2023 → 2023, 2022 → 2022, 그 외 → 2021)', () => {
    const s24 = mkSet({ id: 'custom_2a', department: '소프트웨어학과', admissionYearFrom: 2025 })
    expect(bundleFor(s24).catalog).toBe(catalog2024Sw)
    const s23 = mkSet({ id: 'custom_2', department: '소프트웨어학과', admissionYearFrom: 2023 })
    expect(bundleFor(s23).catalog).toBe(catalog2023Sw)
    const s22 = mkSet({ id: 'custom_2b', department: '소프트웨어학과', admissionYearFrom: 2022 })
    expect(bundleFor(s22).catalog).toBe(catalog2022Sw)
    const s21 = mkSet({ id: 'custom_3', department: '소프트웨어학과', admissionYearFrom: 2021 })
    expect(bundleFor(s21).catalog).toBe(catalog2021Sw)
  })

  it('학과 미기재(레거시 커스텀 세트)도 학번 폴백 유지', () => {
    const s = mkSet({ id: 'custom_4', admissionYearFrom: 2021 })
    expect(bundleFor(s).catalog).toBe(catalog2021Sw)
  })

  it('비SW 학과 세트 → 빈 번들(SW 카탈로그를 물려주지 않음)', () => {
    const s = mkSet({ id: 'custom_5', department: '기계공학과', admissionYearFrom: 2023 })
    expect(bundleFor(s).catalog).toHaveLength(0)
    expect(bundleFor(s).rules).toHaveLength(0)
  })
})

describe('normalizeReqSetGroups (구버전 영역 그룹 호환)', () => {
  // 온보딩 clone-on-edit 이전에 저장된 커스텀 세트: 옛 'major'/'free' 그룹.
  const legacy = mkSet({
    id: 'custom_legacy',
    buckets: [
      { id: 'major_required', label: '전공필수', group: 'major' as never, minCredits: 36 },
      { id: 'major_elective', label: '전공선택', group: 'major' as never, minCredits: 37 },
      { id: 'bucket_custom_1', label: '내 전공선택', group: 'major' as never, minCredits: 3 },
      { id: 'general_elective', label: '일반선택', group: 'free' as never, minCredits: 28 },
    ],
  })

  it("옛 'major'는 영역 id로 전공필수/전공선택 구분(임의 영역은 전공선택)", () => {
    const g = new Map(normalizeReqSetGroups(legacy).buckets.map((b) => [b.id, b.group]))
    expect(g.get('major_required')).toBe('major_required')
    expect(g.get('major_elective')).toBe('major_elective')
    expect(g.get('bucket_custom_1')).toBe('major_elective')
  })

  it("옛 'free'는 일반선택(general_elective)으로 → 폴백 영역 유지", () => {
    const g = new Map(normalizeReqSetGroups(legacy).buckets.map((b) => [b.id, b.group]))
    expect(g.get('general_elective')).toBe('general_elective')
  })

  it('현행 값만 있는 세트는 원본 참조를 그대로 반환(불필요한 복제 없음)', () => {
    expect(normalizeReqSetGroups(reqSet2021SwAdvanced)).toBe(reqSet2021SwAdvanced)
  })
})

describe('additionalMajorTemplates', () => {
  it('SW 학과: 연계전공 포함 전체 템플릿', () => {
    expect(additionalMajorTemplates(null, 2021, '소프트웨어학과')).toBe(
      additionalMajorRules2021Sw,
    )
  })

  it('비SW 학과: 전학교 공통 유형만(연계전공 제외)', () => {
    const rules = additionalMajorTemplates(null, 2022, '기계공학과')
    expect(rules.some((r) => r.type === 'linked_major')).toBe(false)
    expect(rules.some((r) => r.type === 'double_major')).toBe(true)
    expect(rules.some((r) => r.type === 'minor')).toBe(true)
  })

  it('비SW 세트(빈 번들)여도 공통 템플릿은 나온다', () => {
    const s = mkSet({ id: 'custom_6', department: '기계공학과', admissionYearFrom: 2022 })
    const rules = additionalMajorTemplates(s)
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.some((r) => r.type === 'linked_major')).toBe(false)
  })

  it('학번·학과 미상 → 기존 레거시 동작(2021/2022 SW 템플릿)', () => {
    expect(additionalMajorTemplates(null)).toBe(additionalMajorRules2021Sw)
    expect(additionalMajorTemplates(null, 2022)).toBe(additionalMajorRules2022Sw)
  })
})
