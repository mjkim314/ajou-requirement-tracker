/**
 * bundleFor / catalogForSet / additionalMajorTemplates 검증.
 *
 * 핵심 계약:
 * - 비SW 학과 세트에 SW 카탈로그를 조용히 물려주지 않는다(빈 번들 = 카탈로그 미지정).
 *   SW 세트·학과 미기재 레거시 세트는 학번으로 카탈로그 연도를 고른다(데이터_정정_백로그.md #2).
 * - 앱이 실제로 쓰는 카탈로그는 학과 + **학번에 맞는 교양**의 합성이다(merge.ts).
 */

import { describe, it, expect } from 'vitest'
import { evaluate } from '../engine/index'
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
import { demoPersistedState } from './appData'
import {
  additionalMajorTemplates,
  bundleFor,
  catalogForSet,
  normalizeReqSetGroups,
  resolveInput,
} from './dataSources'

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

describe('catalogForSet (학과 + 학번별 교양)', () => {
  it('학과 과목과 교양 과목이 한 카탈로그로 합쳐진다', () => {
    const keys = new Set(catalogForSet(reqSet2021SwAdvanced, 2021).map((e) => e.courseKey))
    expect(keys.has('SW-ALGORITHM')).toBe(true) // 학과
    expect(keys.has('GE-WRITING')).toBe(true) // 교양필수
    expect(keys.has('GE-HP-WHAT-IS-HISTORY')).toBe(true) // 영역별교양
  })

  it('학번이 다르면 그 학번의 교양 편제가 걸린다', () => {
    const y2021 = new Set(catalogForSet(reqSet2021SwAdvanced, 2021).map((e) => e.courseKey))
    const y2025 = new Set(catalogForSet(reqSet2021SwAdvanced, 2025).map((e) => e.courseKey))
    expect(y2021.has('GE-AJOU-SANGSANG-HEALTH')).toBe(false)
    expect(y2025.has('GE-AJOU-SANGSANG-HEALTH')).toBe(true)
  })

  it('학번을 모르면 세트의 admissionYearFrom으로 고른다', () => {
    expect(catalogForSet(reqSet2021SwAdvanced, null)).toBe(
      catalogForSet(reqSet2021SwAdvanced, 2021),
    )
  })

  it('같은 (세트, 학번)이면 같은 배열을 재사용한다(검색 인덱스 재생성 방지)', () => {
    expect(catalogForSet(reqSet2021SwAdvanced, 2022)).toBe(
      catalogForSet(reqSet2021SwAdvanced, 2022),
    )
  })

  it('비SW 학과 세트는 카탈로그 미지정이어도 교양은 붙는다', () => {
    const s = mkSet({ id: 'custom_ge', department: '기계공학과', admissionYearFrom: 2023 })
    const keys = new Set(catalogForSet(s, 2023).map((e) => e.courseKey))
    expect(keys.has('SW-ALGORITHM')).toBe(false)
    expect(keys.has('GE-WRITING')).toBe(true)
  })
})

describe('resolveInput (데모 상태 통합)', () => {
  const input = resolveInput(demoPersistedState())!

  it('데모 과목이 전부 카탈로그에 잡힌다', () => {
    const r = evaluate(input)
    expect(r.diagnostics.unmatched).toHaveLength(0)
    expect(r.diagnostics.ambiguous).toHaveLength(0)
  })

  it('데모의 교양 2과목이 영역별교양 6학점으로 집계된다', () => {
    const r = evaluate(input)
    const area = r.buckets.find((b) => b.id === 'area_liberal')!
    expect(area.earned).toBe(6)
    expect(area.required).toBe(9)
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
