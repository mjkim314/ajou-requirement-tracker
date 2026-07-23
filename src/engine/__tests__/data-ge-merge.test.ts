/**
 * 학과 카탈로그 + 교양 카탈로그 합성 검증 (src/data/merge.ts).
 *
 * (A) 합성 규칙 — 학번별 교양 선택 · 학과 우선 · 중복 제거
 * (B) 계열 제외 영역 — 요건 세트가 인정하는 영역만 영역별교양으로 집계
 * (C) 판정 — 합성 카탈로그로 evaluate()가 실제로 맞게 나오는지
 * (D) 구버전 자리표시자 호환
 *
 * 편제 정본: 교양_편제.md (계열별 제외 영역 표)
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, resolveQuery } from '../index.js'
import type { Course, RequirementSet } from '../types.js'
import {
  catalog2021Sw,
  catalog2024Sw,
  geCatalogByYear,
  reqSet2021SwAdvanced,
  reqSet2024SwAdvanced,
  additionalMajorRules2021Sw,
} from '../../data/index.js'
import {
  areaPolicyOf,
  catalogFor,
  excludedAreaOf,
  geCatalogForYear,
  LEGACY_GE_PLACEHOLDERS,
} from '../../data/merge.js'
import { buildSearchDocs, searchDocs } from '../../app/search.js'
import {
  mk,
  commonRequired,
  advancedProfile,
  advancedNonCurricular,
  AREA_TRIO_REAL,
} from './fixtures/builders.js'

const SET = reqSet2021SwAdvanced
const MERGED = catalogFor(catalog2021Sw, 2021, SET)
const BY_KEY = new Map(MERGED.map((e) => [e.courseKey, e]))

/** 영역별교양 인정 영역(2021 SW = 이공계라 자연과 과학 제외). */
const POLICY = areaPolicyOf(SET)!

// ────────────────────────────────────────────────────────────
// A. 합성 규칙
// ────────────────────────────────────────────────────────────

describe('A. 학과 + 교양 합성', () => {
  it('A-01 학번에 맞는 교양 카탈로그가 걸린다', () => {
    expect(geCatalogForYear(2021)).toBe(geCatalogByYear[2021])
    expect(geCatalogForYear(2025)).toBe(geCatalogByYear[2025])
    // 범위 밖 학번은 가장 가까운 편제로
    expect(geCatalogForYear(2019)).toBe(geCatalogByYear[2021])
    expect(geCatalogForYear(2030)).toBe(geCatalogByYear[2026])
    expect(geCatalogForYear(null)).toHaveLength(0)
  })

  it('A-02 2025 개편 과목은 2025 학번에만 들어온다', () => {
    const m2021 = new Set(catalogFor(catalog2021Sw, 2021, SET).map((e) => e.courseKey))
    const m2025 = new Set(catalogFor(catalog2024Sw, 2025, reqSet2024SwAdvanced).map((e) => e.courseKey))
    expect(m2021.has('GE-AJOU-SANGSANG-HEALTH')).toBe(false)
    expect(m2025.has('GE-AJOU-SANGSANG-HEALTH')).toBe(true)
    expect(m2025.has('GE-ENGLISH')).toBe(true) // 2025 통합 영어
  })

  it('A-03 학과 카탈로그에는 더 이상 교양 자리표시자가 없다', () => {
    for (const cat of [catalog2021Sw, catalog2024Sw]) {
      expect(cat.filter((e) => e.courseKey.startsWith('GE-'))).toHaveLength(0)
    }
  })

  it('A-04 요건 세트가 가리키는 교양 필수는 교양 카탈로그가 공급한다', () => {
    for (const key of ['GE-ENGLISH-1', 'GE-ENGLISH-2', 'GE-WRITING', 'GE-AJOU-CHARACTER']) {
      expect(BY_KEY.has(key), key).toBe(true)
    }
    // 학과 스텁이 아니라 요람 원문 항목(학수번호·영문명 보유)
    expect(BY_KEY.get('GE-ENGLISH-1')?.codes).toContain('ENG111')
    expect(BY_KEY.get('GE-WRITING')?.codes).toContain('KOR101')
  })

  it('A-05 courseKey 유일 + 이름 충돌 시 학과가 이긴다', () => {
    const keys = MERGED.map((e) => e.courseKey)
    expect(new Set(keys).size).toBe(keys.length)
    // 확률및통계1·창업실습1은 교양 목록에도 있지만 학과 소관 — 교양 쪽 항목은 빠진다
    expect(BY_KEY.has('MATH-PROB-1')).toBe(true)
    expect(BY_KEY.has('GE-NS-PROBABILITY-STATISTICS-1')).toBe(false)
    expect(BY_KEY.has('SW-STARTUP-1')).toBe(true)
    expect(BY_KEY.has('GE-SEL-START-UP-PRACTICE-1')).toBe(false)
  })

  it('A-06 이름 중복이 없어 자동완성·이름 해석이 후보 1건으로 확정된다', () => {
    const index = buildCatalogIndex(MERGED)
    for (const name of ['확률및통계1', '창업실습1', '영어1']) {
      const r = resolveQuery(name, index)
      expect(r.ambiguous, name).toBe(false)
      expect(r.courseKey, name).not.toBeNull()
    }
    expect(searchDocs('확률및통계1', buildSearchDocs(MERGED), 8)).toHaveLength(1)
  })
})

// ────────────────────────────────────────────────────────────
// B. 계열 제외 영역
// ────────────────────────────────────────────────────────────

describe('B. 계열 제외 영역', () => {
  it('B-01 인정 영역은 요건 세트가 정한다(2021 SW = 이공계 3영역)', () => {
    expect([...POLICY.acceptedIds].sort()).toEqual(['hist_phil', 'human_soc', 'lit_art'])
    expect(POLICY.bucketId).toBe('area_liberal')
  })

  it('B-02 제외 영역(자연과 과학) 과목은 일반선택으로 귀속되고 area 태그는 남는다', () => {
    const natSci = MERGED.filter((e) => e.area === 'nat_sci')
    expect(natSci.length).toBeGreaterThan(10)
    for (const e of natSci) {
      expect(e.defaultBucket, e.courseKey).toBe('general_elective')
      expect(e.note ?? '').toContain('영역별교양 미인정')
    }
  })

  it('B-03 인정 영역 과목은 영역별교양 그대로', () => {
    for (const key of AREA_TRIO_REAL) {
      const e = BY_KEY.get(key)!
      expect(e.defaultBucket, key).toBe('area_liberal')
      expect(excludedAreaOf(e, POLICY), key).toBeNull()
    }
  })

  it('B-04 excludedAreaOf: 제외 영역만 영역 id를 돌려준다', () => {
    expect(excludedAreaOf(BY_KEY.get('GE-NS-WHAT-IS-PHYSICS'), POLICY)).toBe('nat_sci')
    expect(excludedAreaOf(BY_KEY.get('GE-HP-WHAT-IS-HISTORY'), POLICY)).toBeNull()
    expect(excludedAreaOf(BY_KEY.get('SW-ALGORITHM'), POLICY)).toBeNull()
    expect(excludedAreaOf(null, POLICY)).toBeNull()
    // 영역 스펙이 없는 세트면 제외 판정 자체를 하지 않는다
    expect(excludedAreaOf(BY_KEY.get('GE-NS-WHAT-IS-PHYSICS'), null)).toBeNull()
  })

  it('B-05 영역 정의가 다른 세트에는 다른 제외 영역이 적용된다', () => {
    // 인문대(사학과) 가정: 역사와 철학을 빼고 자연과 과학을 인정하는 세트
    const humanities: RequirementSet = {
      ...SET,
      id: 'rs_test_humanities',
      buckets: SET.buckets.map((b) =>
        b.id === 'area_liberal'
          ? {
              ...b,
              minCredits: 12,
              minDistinctAreas: 3,
              areas: [
                { id: 'lit_art', label: '문학과 예술', minCourses: 1 },
                { id: 'human_soc', label: '인간과 사회', minCourses: 1 },
                { id: 'nat_sci', label: '자연과 과학', minCourses: 1 },
              ],
            }
          : b,
      ),
    }
    const merged = new Map(
      catalogFor(catalog2021Sw, 2021, humanities).map((e) => [e.courseKey, e]),
    )
    expect(merged.get('GE-NS-WHAT-IS-PHYSICS')?.defaultBucket).toBe('area_liberal')
    expect(merged.get('GE-HP-WHAT-IS-HISTORY')?.defaultBucket).toBe('general_elective')
  })
})

// ────────────────────────────────────────────────────────────
// C. 판정
// ────────────────────────────────────────────────────────────

const BASE = {
  profile: advancedProfile(),
  requirementSet: SET,
  catalog: MERGED,
  additionalMajorRules: additionalMajorRules2021Sw,
  nonCurricularState: advancedNonCurricular(),
}

function bucketOf(courses: Course[], id: string) {
  return evaluate({ ...BASE, courses }).buckets.find((b) => b.id === id)!
}

describe('C. 합성 카탈로그 판정', () => {
  it('C-01 인정 영역 3과목 → 영역별교양 9학점 충족', () => {
    const b = bucketOf(
      AREA_TRIO_REAL.map((k) => mk(k)),
      'area_liberal',
    )
    expect(b.earned).toBe(9)
    expect(b.satisfied).toBe(true)
  })

  it('C-02 제외 영역 3과목 → 영역별교양 0학점, 학점은 일반선택으로', () => {
    const courses = [
      mk('GE-NS-WHAT-IS-PHYSICS'),
      mk('GE-NS-WHAT-IS-CHEMISTRY'),
      mk('GE-NS-WHAT-IS-THE-UNIVERSE'),
    ]
    const r = evaluate({ ...BASE, courses })
    expect(r.buckets.find((b) => b.id === 'area_liberal')?.earned).toBe(0)
    expect(r.buckets.find((b) => b.id === 'general_elective')?.earned).toBe(9)
    expect(r.credits.earned).toBe(9) // 학점이 사라지지는 않는다
  })

  it('C-03 인정 2영역 + 제외 1영역 → 영역 수 미달로 미충족', () => {
    const b = bucketOf(
      [mk('GE-HP-WHAT-IS-HISTORY'), mk('GE-LA-WHAT-IS-LITERATURE'), mk('GE-NS-WHAT-IS-PHYSICS')],
      'area_liberal',
    )
    expect(b.earned).toBe(6)
    expect(b.satisfied).toBe(false)
    expect(b.reasons.join(' ')).toContain('영역')
  })

  it('C-04 고급영어1·2 → 영어 영역 대체 인정', () => {
    const b = bucketOf([mk('GE-ENGLISH-ADV-1'), mk('GE-ENGLISH-ADV-2')], 'english')
    expect(b.earned).toBe(6)
    expect(b.satisfied).toBe(true)
    expect(b.missingCourses).toHaveLength(0)
  })

  it('C-05 아주희망 → SW커리어세미나 대체 인정', () => {
    const b = bucketOf([mk('GE-AJOU-HOPE', { credits: 1, grade: 'P' })], 'sw_seminar')
    expect(b.satisfied).toBe(true)
  })

  it('C-06 교양선택(일반선택 귀속) 과목은 일반선택으로 집계', () => {
    const r = evaluate({ ...BASE, courses: [mk('GE-SEL-JAPANESE-1')] })
    const rc = r.resolved[0]!
    expect(rc.unmatched).toBe(false)
    expect(rc.bucketId).toBe('general_elective')
  })

  it('C-07 전체 성적표: 실제 교양 과목으로 140학점 졸업 가능', () => {
    const courses: Course[] = [
      ...commonRequired(AREA_TRIO_REAL),
      mk('SW-CAPSTONE'),
      mk('SW-SELF-PROJECT'),
      ...['SW-DB', 'SW-SW-ENG', 'SW-AI', 'SW-CV', 'SW-ML', 'SW-COMPILER', 'SW-OSS-INTRO',
        'SW-DISTRIBUTED', 'SW-CG', 'SW-DATA-MINING'].map((k) => mk(k)),
      mk('SW-IND-SEMINAR'),
      ...Array.from({ length: 9 }, (_, i) => mk(null, { nameSnapshot: `교양${i + 1}`, credits: 3 })),
      mk(null, { nameSnapshot: '교양-1학점', credits: 1 }),
    ]
    const r = evaluate({ ...BASE, courses })
    expect(r.credits.earned).toBe(140)
    expect(r.verdict).toBe('graduatable')
    expect(r.diagnostics.unmatched.map((u) => u.input)).toEqual(
      Array.from({ length: 9 }, (_, i) => `교양${i + 1}`).concat('교양-1학점'),
    )
  })
})

// ────────────────────────────────────────────────────────────
// D. 구버전 자리표시자
// ────────────────────────────────────────────────────────────

describe('D. 구버전 임시 교양 과목', () => {
  it('D-01 예전에 입력해 둔 기록은 그대로 판정된다', () => {
    const b = bucketOf(
      [mk('GE-AREA-HIST'), mk('GE-AREA-ART'), mk('GE-AREA-SOC')],
      'area_liberal',
    )
    expect(b.earned).toBe(9)
    expect(b.satisfied).toBe(true)
  })

  it('D-02 새로 고를 수는 없다(검색·자동완성 비노출)', () => {
    const docs = buildSearchDocs(MERGED)
    for (const e of LEGACY_GE_PLACEHOLDERS) {
      expect(e.active).toBe(false)
      expect(searchDocs(e.name, docs, 8).map((x) => x.courseKey)).not.toContain(e.courseKey)
    }
  })
})
