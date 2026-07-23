/**
 * 다산학부대학 교양 카탈로그(2021~2026) 검증.
 *
 * 교양은 학과가 아니라 **전 학과가 공유하는 기반 데이터**라, 요건 세트 없이
 * 카탈로그만 존재한다. 따라서 판정 전이 테스트 대신
 * (A) 스키마·참조 무결성 (B) 학번간 courseKey 일관성 (C) 편제 대조를 가드로 둔다.
 *
 * 편제 정본: 교양_편제.md
 * 컴파일 타입체크는 resolveJsonModule 넓힘 때문에 JSON 무결성을 못 잡으므로
 * 이 런타임 테스트가 유일한 가드다.
 */

import { describe, it, expect } from 'vitest'
import { buildCatalogIndex } from '../index.js'
import type { CatalogEntry } from '../types.js'
import { geCatalogByYear } from '../../data/index.js'

const YEARS = [2021, 2022, 2023, 2024, 2025, 2026] as const

/** 영역별교양 영역 id. conn_integ(연결과 통합)는 2025 개편으로 신설. */
const AREAS = new Set(['hist_phil', 'lit_art', 'human_soc', 'nat_sci', 'conn_integ'])

/** 교양 카탈로그가 쓰는 정규 버킷 id. 학과 요건세트가 이 id로 버킷을 만든다. */
const BUCKETS = new Set([
  'english',
  'writing',
  'ajou_character',
  'ajou_hope',
  'ajou_sangsang',
  'area_liberal',
  'general_elective',
])

const GRADING = new Set(['ABCDF', 'ABF', 'ABCF', 'PF'])

/** 학과 카탈로그(catalog-*-sw.json)와 공유하는 고정키 — 바뀌면 학과 세트가 깨진다. */
const CANONICAL_KEYS = [
  'GE-ENGLISH-1',
  'GE-ENGLISH-2',
  'GE-WRITING',
  'GE-AJOU-CHARACTER',
  'GE-AJOU-HOPE',
]

function entries(year: number): CatalogEntry[] {
  const c = geCatalogByYear[year]
  if (!c) throw new Error(`${year} 교양 카탈로그 없음`)
  return c
}

const ALL: CatalogEntry[] = YEARS.flatMap((y) => entries(y))

// ────────────────────────────────────────────────────────────
// A. 스키마 · 참조 무결성 (학번별)
// ────────────────────────────────────────────────────────────

describe('A. 교양 카탈로그 스키마 무결성', () => {
  it.each(YEARS)('A-01 %d courseKey 유일성', (year) => {
    const keys = entries(year).map((e) => e.courseKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(YEARS)('A-02 %d 필수 필드 존재·타입', (year) => {
    for (const e of entries(year)) {
      expect(typeof e.courseKey, `${e.courseKey} courseKey`).toBe('string')
      expect(e.courseKey.length, `${e.courseKey} 빈 키`).toBeGreaterThan(0)
      expect(typeof e.name, `${e.courseKey} name`).toBe('string')
      expect(e.name.length, `${e.courseKey} 빈 이름`).toBeGreaterThan(0)
      expect(typeof e.credits, `${e.courseKey} credits`).toBe('number')
      expect(e.credits, `${e.courseKey} credits 음수`).toBeGreaterThanOrEqual(0)
      expect(typeof e.defaultBucket, `${e.courseKey} defaultBucket`).toBe('string')
    }
  })

  it.each(YEARS)('A-03 %d defaultBucket 화이트리스트', (year) => {
    for (const e of entries(year)) {
      expect(BUCKETS.has(e.defaultBucket), `${e.courseKey} bucket=${e.defaultBucket}`).toBe(true)
    }
  })

  it.each(YEARS)('A-04 %d area는 화이트리스트이고 area_liberal과 짝', (year) => {
    for (const e of entries(year)) {
      if (e.area != null) {
        expect(AREAS.has(e.area), `${e.courseKey} area=${e.area}`).toBe(true)
        // area 태그가 있으면 반드시 영역별교양 — 아니면 영역 판정이 과다 인정된다.
        expect(e.defaultBucket, `${e.courseKey} area 있는데 bucket≠area_liberal`).toBe('area_liberal')
      }
      if (e.defaultBucket === 'area_liberal') {
        expect(e.area, `${e.courseKey} area_liberal인데 area 없음`).toBeTruthy()
      }
    }
  })

  it.each(YEARS)('A-05 %d gradingType 유효값', (year) => {
    for (const e of entries(year)) {
      if (e.gradingType != null) {
        expect(GRADING.has(e.gradingType), `${e.courseKey} gradingType=${e.gradingType}`).toBe(true)
      }
    }
  })

  it.each(YEARS)('A-06 %d buildCatalogIndex가 전 과목을 색인', (year) => {
    const cat = entries(year)
    const index = buildCatalogIndex(cat)
    expect(index.byKey.size).toBe(cat.length)
    expect(index.entries.length).toBe(cat.length)
  })
})

// ────────────────────────────────────────────────────────────
// B. 학번간 일관성 — 교양을 "재활용 기반"으로 쓰는 근거
// ────────────────────────────────────────────────────────────

describe('B. 학번간 courseKey 일관성', () => {
  it('B-01 재사용 고정키가 전 학번에 존재', () => {
    for (const key of CANONICAL_KEYS) {
      const years = YEARS.filter((y) => entries(y).some((e) => e.courseKey === key))
      expect(years.length, `${key}가 없는 학번 존재`).toBeGreaterThan(0)
    }
  })

  it('B-02 같은 courseKey는 학번간 같은 과목(이름 또는 별칭이 겹침)', () => {
    const byKey = new Map<string, CatalogEntry[]>()
    for (const e of ALL) {
      const list = byKey.get(e.courseKey) ?? []
      list.push(e)
      byKey.set(e.courseKey, list)
    }
    const mismatched: string[] = []
    for (const [key, list] of byKey) {
      if (list.length < 2) continue
      // 학번마다 요람 표기가 다를 수 있으므로(P1) 이름 또는 aliases가 겹치면 동일 과목으로 본다.
      const labelSets = list.map((e) => new Set([e.name, ...(e.aliases ?? [])]))
      const first = labelSets[0]!
      const allOverlap = labelSets.every((s) => [...s].some((n) => first.has(n)))
      if (!allOverlap) mismatched.push(`${key}: ${list.map((e) => e.name).join(' | ')}`)
    }
    expect(mismatched, `학번간 이름이 전혀 겹치지 않는 키:\n${mismatched.join('\n')}`).toEqual([])
  })

  it('B-03 같은 courseKey의 gradingType은 학번간 일치', () => {
    const byKey = new Map<string, Set<string>>()
    for (const e of ALL) {
      const s = byKey.get(e.courseKey) ?? new Set<string>()
      s.add(e.gradingType ?? 'none')
      byKey.set(e.courseKey, s)
    }
    const conflicts = [...byKey.entries()]
      .filter(([, s]) => s.size > 1)
      .map(([k, s]) => `${k}: ${[...s].join('/')}`)
    expect(conflicts, `gradingType 불일치:\n${conflicts.join('\n')}`).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────
// C. 편제 대조 — 교양_편제.md의 핵심 수치가 데이터와 맞는가
// ────────────────────────────────────────────────────────────

describe('C. 학번별 교양 편제', () => {
  it('C-01 2021~2024는 영역별교양 4개 영역', () => {
    for (const year of [2021, 2022, 2023, 2024]) {
      const areas = new Set(entries(year).map((e) => e.area).filter(Boolean))
      expect(areas, `${year} 영역`).toEqual(
        new Set(['hist_phil', 'lit_art', 'human_soc', 'nat_sci']),
      )
    }
  })

  it('C-02 2025~2026은 연결과 통합이 추가돼 5개 영역', () => {
    for (const year of [2025, 2026]) {
      const areas = new Set(entries(year).map((e) => e.area).filter(Boolean))
      expect(areas, `${year} 영역`).toEqual(
        new Set(['hist_phil', 'lit_art', 'human_soc', 'nat_sci', 'conn_integ']),
      )
    }
  })

  it('C-03 아주상상프로젝트는 2025~2026에만, 3학점', () => {
    for (const year of [2021, 2022, 2023, 2024]) {
      expect(entries(year).filter((e) => e.defaultBucket === 'ajou_sangsang')).toHaveLength(0)
    }
    for (const year of [2025, 2026]) {
      const sangsang = entries(year).filter((e) => e.defaultBucket === 'ajou_sangsang')
      // 4개 대주제 중 택1 — 요람 p50 교육과정표 기준 각 3학점
      expect(sangsang.length, `${year} 아주상상 과목 수`).toBe(4)
      for (const e of sangsang) {
        expect(e.credits, `${year} ${e.name} 학점`).toBe(3)
      }
    }
  })

  it('C-04 영어 개편: 2024까지 영어1+영어2, 2025부터 통합 영어', () => {
    for (const year of [2021, 2022, 2023, 2024]) {
      const keys = new Set(entries(year).map((e) => e.courseKey))
      expect(keys.has('GE-ENGLISH-1'), `${year} 영어1`).toBe(true)
      expect(keys.has('GE-ENGLISH-2'), `${year} 영어2`).toBe(true)
    }
    for (const year of [2025, 2026]) {
      const eng = entries(year).filter((e) => e.defaultBucket === 'english')
      // 2025~는 통합 '영어'가 생기고, 2024학번 이하용 구 과목이 함께 실린다.
      expect(eng.length, `${year} 영어 계열 과목 수`).toBeGreaterThanOrEqual(4)
    }
  })

  it('C-05 P/F는 요람이 명시한 과목만(아주희망·아주강좌)', () => {
    for (const year of YEARS) {
      for (const e of entries(year)) {
        if (e.gradingType !== 'PF') continue
        const isDocumented = e.name.includes('아주희망') || e.name.includes('아주강좌')
        expect(isDocumented, `${year} ${e.name}: 요람 P/F 근거 없음`).toBe(true)
      }
    }
  })

  it('C-06 아주인성·마중물은 gradingType 미부여(요람 근거 없음)', () => {
    for (const year of YEARS) {
      for (const e of entries(year)) {
        if (e.defaultBucket !== 'ajou_character') continue
        expect(e.gradingType, `${year} ${e.name}`).toBeUndefined()
      }
    }
  })

  it('C-07 BSM·기초과목은 교양 카탈로그에서 제외', () => {
    // 수학1/물리학실험 등은 학과 전공 기초라 교양 카탈로그에 있으면 안 된다.
    const banned = ['수학1', '수학2', '물리학실험', '화학실험', '생명과학실험']
    for (const year of YEARS) {
      for (const e of entries(year)) {
        expect(banned.includes(e.name), `${year} ${e.name}은 BSM이라 제외 대상`).toBe(false)
      }
    }
  })
})
