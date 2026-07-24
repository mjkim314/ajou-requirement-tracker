/**
 * R2 — 범용 데이터 무결성 스위트.
 *
 * 매니페스트(R1)에 등록된 **전 번들을 순회**하며 A-계열 구조 검사를 적용한다.
 * 새 학과·학번 JSON을 규약대로 추가하면 테스트 코드 0줄로 이 검사 전체가 자동
 * 적용된다. 여기에는 어떤 번들에나 성립하는 구조 불변식만 둔다 — 요람에서 읽은
 * 학과·학번 고유 수치(총학점 140, 전필 11과목 등)는 학번별 data-*.test.ts 소관.
 *
 * 의도된 예외(학수번호 중복 쌍, 대체규칙의 폐지 과목 참조 등)는 아래
 * 허용 목록 **데이터**로 관리한다. 검사는 "예외 없음"이 아니라
 * "예외가 선언된 목록과 정확히 일치"를 요구한다 — 새 예외가 생기면
 * 실패하고, 선언된 예외가 사라져도(정정됨) 실패해 목록 정리를 강제한다.
 */
import { describe, expect, it } from 'vitest'

import type {
  AdditionalMajorRule,
  CatalogEntry,
  RequirementSet,
} from '../types.js'
import { buildCatalogIndex } from '../normalize.js'
import { DATASETS, geCatalogByYear, geYears } from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'

// ────────────────────────────────────────────────────────────
// 의도된 예외 — 번들·세트별 허용 목록 (데이터)
// ────────────────────────────────────────────────────────────

/**
 * 학수번호 중복 허용 맵: 카탈로그 id → { 학수번호 → 그 번호를 공유하는 courseKey(정렬) }.
 * 목록에 없는 카탈로그는 중복 0건이 정상.
 * - 2021·2022 SW: 요람이 SCE411을 모델링시뮬레이션·고급컴퓨터구조 양쪽에 부여(원본 사실).
 * - 2021·2022 SW: 인턴십 신·구 학수번호 공유(INF0401·INF0402). 2023 개편에서 해소.
 * - GE: 편제 문서 표기 그대로 6개년 일관 — 연작 강좌(명저읽기·아주강좌)와 교차 부여.
 *   의도 여부 요람 재확인은 데이터_정정_백로그 13번.
 */
const GE_SHARED_CODES: Record<string, string[]> = {
  CART108: ['GE-LA-CONTEMPORARY-DRAMA-AND-PERFORMANCE', 'GE-SEL-FREE-DRAWING-EXERCISE'],
  SCI114: ['GE-HS-SCIENCE-TECHNOLOGY-AND-LAW', 'GE-NS-ENERGY-AND-SOCIETY'],
  CKOR104: ['GE-HS-CREATIVE-THINKING', 'GE-SEL-CREATIVE-WRITING'],
  CSOC102: ['GE-HS-UNDERSTANDING-MULTICULTURALISM-IN-KOREA', 'GE-SEL-WORK-FAMILY-AND-SOCIAL-WELLBEING'],
  COLT103: ['GE-SEL-LECTURE-PAIRING-1', 'GE-SEL-LECTURE-PAIRING-2', 'GE-SEL-LECTURE-PAIRING-3'],
}
const GE_CMAT108: Record<string, string[]> = {
  CMAT108: ['GE-SEL-DATA-MATH-BASICS', 'GE-SEL-DRONE-BUSINESS-MODEL'],
}
const GE_AJOU102: Record<string, string[]> = {
  AJOU102: ['GE-SEL-AJOU-LECTURE-SERIES-1', 'GE-SEL-AJOU-LECTURE-SERIES-2'],
}
const SW_INTERN_CODES: Record<string, string[]> = {
  INF0401: ['SW-INTERN-1', 'SW-INTERN-3'],
  INF0402: ['SW-INTERN-2', 'SW-INTERN-4'],
}
const DUPLICATE_CODES: Record<string, Record<string, string[]>> = {
  '2021-sw': { SCE411: ['SW-ADV-COMP-ARCH', 'SW-MODEL-SIM'], ...SW_INTERN_CODES },
  '2022-sw': { SCE411: ['SW-ADV-COMP-ARCH', 'SW-MODEL-SIM'], ...SW_INTERN_CODES },
  '2021-ge': { ...GE_SHARED_CODES, ...GE_AJOU102 },
  '2022-ge': { ...GE_SHARED_CODES, ...GE_CMAT108, ...GE_AJOU102 },
  '2023-ge': { ...GE_SHARED_CODES, ...GE_CMAT108, ...GE_AJOU102 },
  '2024-ge': { ...GE_SHARED_CODES, ...GE_CMAT108, ...GE_AJOU102 },
  '2025-ge': { ...GE_SHARED_CODES, ...GE_CMAT108 },
  '2026-ge': { ...GE_SHARED_CODES, ...GE_CMAT108 },
}

/**
 * 세트가 채택하지 않은 교양 버킷: 세트 id → 합성 카탈로그에 존재하지만 세트에 없는
 * defaultBucket 값(정렬). 엔진은 이런 과목을 6순위 폴백(일반선택)으로 귀속한다 —
 * resolve.ts 5순위가 `bucketIds.has(defaultBucket)`일 때만 성립하기 때문(설계 동작).
 * SW는 아주희망(ajou_hope)을 별도 버킷 없이 운영한다(2022 SW는 대체규칙으로 흡수).
 */
const UNADOPTED_DEFAULT_BUCKETS: Record<string, string[]> = {
  rs_2021_sw_advanced: ['ajou_hope'],
  rs_2021_sw_general: ['ajou_hope'],
  rs_2022_sw_advanced: ['ajou_hope'],
  rs_2022_sw_general: ['ajou_hope'],
  rs_2023_sw_advanced: ['ajou_hope'],
  rs_2023_sw_general: ['ajou_hope'],
  rs_2024_sw_advanced: ['ajou_hope'],
  rs_2024_sw_general: ['ajou_hope'],
  rs_2025_sw_advanced: ['ajou_hope'],
  rs_2025_sw_general: ['ajou_hope'],
  rs_2026_sw_advanced: ['ajou_hope'],
  rs_2026_sw_general: ['ajou_hope'],
}

/**
 * 대체규칙(equivalents)의 의도된 dangling `from`: 세트 id → 정렬된 from 키 목록.
 * 폐지·개명돼 현행 카탈로그에 없는 과목을 옛 수강 기록 호환을 위해 참조하는 경우다.
 * 목록에 없는 세트는 dangling 0건이 정상.
 */
const DANGLING_EQUIVALENT_FROM: Record<string, string[]> = {
  rs_2021_sw_advanced: ['ICT-DATA-STRUCT', 'ICT-OSS-INTRO'],
  rs_2021_sw_general: ['ICT-DATA-STRUCT', 'ICT-OSS-INTRO'],
  rs_2023_sw_advanced: ['SW-CREATIVE-SW-INTRO'],
  rs_2023_sw_general: ['SW-CREATIVE-SW-INTRO'],
  rs_2024_sw_advanced: ['SW-CREATIVE-SW-INTRO'],
  rs_2024_sw_general: ['SW-CREATIVE-SW-INTRO'],
}

/**
 * 영역별교양 제외 영역: 세트 id → 세트가 인정하지 않는(합성 카탈로그에 존재하는) 영역 id 정렬 목록.
 * 이공계는 "자연과 과학"이 소속 계열 영역이라 제외된다(교양_편제.md).
 * 세트마다 선언하는 이유: 같은 학과라도 과정(예: ME 공학인증)에 따라 인정 범위가 다를 수 있다.
 */
const EXCLUDED_AREAS: Record<string, string[]> = {
  rs_2021_sw_advanced: ['nat_sci'],
  rs_2021_sw_general: ['nat_sci'],
  rs_2022_sw_advanced: ['nat_sci'],
  rs_2022_sw_general: ['nat_sci'],
  rs_2023_sw_advanced: ['nat_sci'],
  rs_2023_sw_general: ['nat_sci'],
  rs_2024_sw_advanced: ['nat_sci'],
  rs_2024_sw_general: ['nat_sci'],
  rs_2025_sw_advanced: ['nat_sci'],
  rs_2025_sw_general: ['nat_sci'],
  rs_2026_sw_advanced: ['nat_sci'],
  rs_2026_sw_general: ['nat_sci'],
  // ME 공학인증: ABEEK 지정과목 구조상 자연과과학을 인정하고 문학과예술이 빠진다.
  rs_2021_me_accredited: ['lit_art'],
  rs_2021_me_general: ['nat_sci'],
  rs_2022_me_accredited: ['lit_art'],
  // 2022 일반과정도 lit_art 제외 — 요람 인쇄대로 넣은 값(2021과 반대).
  // 편집 오류 의심·학과 확인 대기: 데이터_정정_백로그 9번. 정정되면 이 값도 nat_sci 로 바뀐다.
  rs_2022_me_general: ['lit_art'],
}

// ────────────────────────────────────────────────────────────
// 순회 대상 구성 (매니페스트에서 자동)
// ────────────────────────────────────────────────────────────

interface CatalogCase {
  id: string
  kind: 'dept' | 'ge'
  catalog: CatalogEntry[]
  /**
   * 참조(선수과목 등) 해석 범위 — 학과 카탈로그는 그 학번 교양까지 포함.
   * 합성(catalogFor) 결과의 상한이다: 합성은 이름 충돌 교양 항목을 버리므로
   * 이 집합이 합성 결과보다 약간 넓다(선수과목 검사에는 상한이 안전한 방향).
   */
  refKeys: Set<string>
}

const keysOf = (catalog: CatalogEntry[]) => new Set(catalog.map((e) => e.courseKey))

const catalogCases: CatalogCase[] = [
  ...DATASETS.map((d) => ({
    id: `${d.year}-${d.slug}`,
    kind: 'dept' as const,
    catalog: d.bundle.catalog,
    refKeys: new Set([
      ...keysOf(d.bundle.catalog),
      ...keysOf(geCatalogByYear[d.year] ?? []),
    ]),
  })),
  ...geYears.map((y) => ({
    id: `${y}-ge`,
    kind: 'ge' as const,
    catalog: geCatalogByYear[y]!,
    refKeys: keysOf(geCatalogByYear[y]!),
  })),
]

interface SetCase {
  setId: string
  set: RequirementSet
  /** 학과 + 학번 교양 합성 카탈로그 — 앱이 실제로 쓰는 형태로 검사한다. */
  merged: CatalogEntry[]
  mergedKeys: Set<string>
}

const setCases: SetCase[] = DATASETS.flatMap((d) =>
  Object.values(d.sets).map((set) => {
    const merged = catalogFor(d.bundle.catalog, d.year, set)
    return {
      setId: set.id,
      set,
      merged,
      mergedKeys: new Set(merged.map((e) => e.courseKey)),
    }
  }),
)

interface RuleCase {
  id: string
  rules: AdditionalMajorRule[]
  catalogKeys: Set<string>
}

const ruleCases: RuleCase[] = DATASETS.map((d) => ({
  id: `${d.year}-${d.slug}`,
  rules: d.bundle.rules,
  catalogKeys: new Set(d.bundle.catalog.map((e) => e.courseKey)),
}))

const isNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 중복된 값 목록 — 유일성 검사 실패 시 "몇 개"가 아니라 "무엇이" 중복인지 보여준다. */
const duplicatesOf = (items: string[]): string[] =>
  [...new Set(items.filter((x, i) => items.indexOf(x) !== i))].sort()

const GRADING_TYPES = new Set(['ABCDF', 'ABF', 'ABCF', 'PF'])
const BUCKET_GROUPS = new Set([
  'university_required',
  'department_required',
  'major_required',
  'major_elective',
  'general_elective',
])
const REQUIREMENT_TYPES = new Set([
  'check',
  'score',
  'count',
  'level',
  'alternatives',
  'courseGroupPick',
])
const ALTERNATIVE_TYPES = new Set(['check', 'score', 'level'])
const EQUIVALENT_TYPES = new Set(['replaces', 'sameAs', 'renamed', 'substitutable'])
const EQUIVALENT_DIRECTIONS = new Set(['forward', 'bidirectional'])
const AM_TYPES = new Set([
  'double_major',
  'minor',
  'linked_major',
  'track',
  'micro_degree',
  'self_designed',
  'custom',
])
const COURSE_STATES = new Set([
  'planned',
  'enrolled',
  'completed',
  'retake_planned',
  'dropped',
  'transferred',
  'credited',
])
const GRADE_POINT_KEYS = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F']

// ────────────────────────────────────────────────────────────
// A. 카탈로그 무결성 — 학과·교양 전 카탈로그
// ────────────────────────────────────────────────────────────

describe.each(catalogCases.map((c) => [c.id, c] as const))('카탈로그 %s', (_id, c) => {
  const keys = new Set(c.catalog.map((e) => e.courseKey))

  it('A-01 courseKey 유일', () => {
    expect(duplicatesOf(c.catalog.map((e) => e.courseKey))).toEqual([])
  })

  it('A-02 필수 필드 스키마(courseKey·name·credits·defaultBucket, 배열 필드 원소)', () => {
    const bad: string[] = []
    for (const e of c.catalog) {
      if (!isNonEmptyString(e.courseKey)) bad.push(`${e.courseKey}: courseKey`)
      if (!isNonEmptyString(e.name)) bad.push(`${e.courseKey}: name`)
      if (!isFiniteNumber(e.credits) || e.credits < 0) bad.push(`${e.courseKey}: credits`)
      if (!isNonEmptyString(e.defaultBucket)) bad.push(`${e.courseKey}: defaultBucket`)
      for (const field of ['aliases', 'codes', 'prerequisites'] as const) {
        const arr = e[field]
        if (arr !== undefined && (!Array.isArray(arr) || arr.some((s) => !isNonEmptyString(s)))) {
          bad.push(`${e.courseKey}: ${field}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('A-03 buildCatalogIndex 가 전 과목을 색인한다', () => {
    const index = buildCatalogIndex(c.catalog)
    expect(index.byKey.size).toBe(c.catalog.length)
    expect(index.entries.length).toBe(c.catalog.length)
  })

  it('A-04 gradingType 유효값', () => {
    const bad = c.catalog.filter((e) => e.gradingType != null && !GRADING_TYPES.has(e.gradingType))
    expect(bad.map((e) => e.courseKey)).toEqual([])
  })

  it('A-05 creditBreakdown 합이 credits 와 일치', () => {
    for (const e of c.catalog) {
      if (!e.creditBreakdown) continue
      const sum =
        (e.creditBreakdown.theory ?? 0) +
        (e.creditBreakdown.design ?? 0) +
        (e.creditBreakdown.lab ?? 0)
      expect(sum, `${e.courseKey}: breakdown 합 ${sum} ≠ credits ${e.credits}`).toBeCloseTo(
        e.credits,
        5,
      )
    }
  })

  it('A-06 prerequisites 가 해석 범위(학과+그 학번 교양)의 courseKey 를 가리킨다', () => {
    const dangling: string[] = []
    for (const e of c.catalog) {
      for (const p of e.prerequisites ?? []) {
        if (!c.refKeys.has(p)) dangling.push(`${e.courseKey} → ${p}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('A-07 학수번호 중복이 허용 목록과 정확히 일치', () => {
    const byCode = new Map<string, string[]>()
    for (const e of c.catalog) {
      for (const code of e.codes ?? []) {
        byCode.set(code, [...(byCode.get(code) ?? []), e.courseKey])
      }
    }
    const duplicates: Record<string, string[]> = {}
    for (const [code, courseKeys] of byCode) {
      if (courseKeys.length > 1) duplicates[code] = [...courseKeys].sort()
    }
    expect(duplicates).toEqual(DUPLICATE_CODES[c.id] ?? {})
  })

  if (c.kind === 'dept') {
    it('A-08 학과 카탈로그에 GE- 자리표시자 키 금지', () => {
      expect(c.catalog.filter((e) => e.courseKey.startsWith('GE-')).map((e) => e.courseKey)).toEqual(
        [],
      )
    })
  }
})

// ────────────────────────────────────────────────────────────
// B. 요건 세트 무결성 — 전 세트 × 합성 카탈로그
// ────────────────────────────────────────────────────────────

describe.each(setCases.map((s) => [s.setId, s] as const))('요건 세트 %s', (_id, s) => {
  const { set, merged, mergedKeys } = s
  const bucketIds = new Set(set.buckets.map((b) => b.id))
  const generalElective = set.buckets.filter((b) => b.group === 'general_elective')

  it('B-01 버킷 id 유일 · group 유효 · minCredits 숫자', () => {
    expect(duplicatesOf(set.buckets.map((b) => b.id))).toEqual([])
    for (const b of set.buckets) {
      expect(BUCKET_GROUPS.has(b.group), `${b.id}: group '${b.group}'`).toBe(true)
      expect(isFiniteNumber(b.minCredits) && b.minCredits >= 0, `${b.id}: minCredits`).toBe(true)
    }
  })

  it("B-02 group:'general_elective' 폴백 버킷이 정확히 1개", () => {
    expect(generalElective.map((b) => b.id)).toHaveLength(1)
  })

  it('B-03 합성 카탈로그(학과+교양) courseKey 유일', () => {
    expect(duplicatesOf(merged.map((e) => e.courseKey))).toEqual([])
  })

  it('B-04 합성 전 과목의 defaultBucket 이 세트 버킷에 존재(미채택 버킷은 선언된 것만)', () => {
    // 미채택 버킷 과목은 엔진이 6순위 폴백(일반선택)으로 귀속한다 — 설계 동작이지만
    // 어떤 버킷이 미채택인지는 선언과 정확히 일치해야 한다(오타 defaultBucket 감지).
    const unadopted = new Set<string>()
    for (const e of merged) {
      if (!bucketIds.has(e.defaultBucket)) unadopted.add(e.defaultBucket)
    }
    expect([...unadopted].sort()).toEqual(UNADOPTED_DEFAULT_BUCKETS[set.id] ?? [])
  })

  it('B-05 requiredCourses 키가 합성 카탈로그에 존재', () => {
    const dangling: string[] = []
    for (const b of set.buckets) {
      for (const key of b.requiredCourses ?? []) {
        if (!mergedKeys.has(key)) dangling.push(`${b.id} → ${key}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('B-06 choiceGroups: 키 존재 · pick 범위 · linkedTo 동일 버킷 참조', () => {
    for (const b of set.buckets) {
      const groups = b.choiceGroups ?? []
      const groupIds = new Set(groups.map((g) => g.id))
      expect(duplicatesOf(groups.map((g) => g.id)), `${b.id}: choiceGroup id 중복`).toEqual([])
      for (const g of groups) {
        const missing = g.courses.filter((key) => !mergedKeys.has(key))
        expect(missing, `${b.id}/${g.id}: 카탈로그에 없는 키`).toEqual([])
        expect(
          g.pick >= 1 && g.pick <= g.courses.length,
          `${b.id}/${g.id}: pick ${g.pick} (과목 ${g.courses.length})`,
        ).toBe(true)
        if (g.linkedTo != null) {
          expect(groupIds.has(g.linkedTo), `${b.id}/${g.id}: linkedTo '${g.linkedTo}'`).toBe(true)
        }
      }
    }
  })

  it('B-07 상한·이월 배선: overflowTo·capBucket 유효, creditCap 은 배선과 짝', () => {
    for (const b of set.buckets) {
      if (b.overflowTo != null) {
        expect(bucketIds.has(b.overflowTo), `${b.id}.overflowTo '${b.overflowTo}'`).toBe(true)
      }
      if (b.creditCap != null) {
        // 버킷 상한도 이월 배선 없이는 엔진(aggregate)이 조용히 무시한다 — 작성 실수로 간주.
        expect(b.overflowTo != null, `${b.id}: creditCap 에 overflowTo 없음`).toBe(true)
      }
    }
    const cgs = set.courseGroups ?? []
    expect(duplicatesOf(cgs.map((g) => g.id)), 'courseGroup id 중복').toEqual([])
    for (const g of cgs) {
      const missing = g.courses.filter((key) => !mergedKeys.has(key))
      expect(missing, `courseGroups/${g.id}: 카탈로그에 없는 키`).toEqual([])
      if (g.capBucket != null) {
        expect(bucketIds.has(g.capBucket), `courseGroups/${g.id}.capBucket`).toBe(true)
      }
      if (g.overflowTo != null) {
        expect(bucketIds.has(g.overflowTo), `courseGroups/${g.id}.overflowTo`).toBe(true)
      }
      if (g.creditCap != null) {
        // 상한만 있고 배선이 없으면 엔진이 조용히 무시한다 — 데이터 작성 실수로 간주.
        // (undefined 도 잡아야 하므로 != null 로 검사 — toBeNull 은 undefined 를 통과시킨다.)
        expect(g.capBucket != null, `courseGroups/${g.id}: creditCap 에 capBucket 없음`).toBe(true)
        expect(g.overflowTo != null, `courseGroups/${g.id}: creditCap 에 overflowTo 없음`).toBe(true)
      }
    }
  })

  it('B-08 영역별교양 정합: 인정 영역 귀속·제외 영역 폴백·제외 집합 선언 일치', () => {
    const areaBuckets = set.buckets.filter((b) => (b.areas?.length ?? 0) > 0)
    for (const b of areaBuckets) {
      const areaIds = new Set((b.areas ?? []).map((a) => a.id))
      expect(areaIds.size, `${b.id}: 영역 id 중복`).toBe(b.areas!.length)
      for (const a of b.areas!) {
        expect(isNonEmptyString(a.label) && a.minCourses >= 0, `${b.id}/${a.id}`).toBe(true)
      }
    }
    // 합성 카탈로그 기준: 첫 영역 버킷(merge.ts 의 areaPolicyOf 와 동일한 선택 규칙)
    const policyBucket = areaBuckets[0]
    if (!policyBucket) {
      // 영역 버킷이 없는 세트에 제외 영역 선언이 남아 있으면 죽은 데이터 — 정리 강제.
      expect(EXCLUDED_AREAS[set.id] ?? []).toEqual([])
      return
    }
    const accepted = new Set((policyBucket.areas ?? []).map((a) => a.id))
    const fallbackId = generalElective[0]?.id
    const excluded = new Set<string>()
    for (const e of merged) {
      if (e.defaultBucket === policyBucket.id) {
        expect(e.area != null, `${e.courseKey}: 영역 버킷 소속인데 area 없음`).toBe(true)
        expect(accepted.has(e.area!), `${e.courseKey}: 미인정 영역 '${e.area}'`).toBe(true)
      }
      if (e.area != null && !accepted.has(e.area)) {
        excluded.add(e.area)
        expect(e.defaultBucket, `${e.courseKey}: 제외 영역인데 일반선택 폴백 아님`).toBe(fallbackId)
      }
    }
    expect([...excluded].sort()).toEqual(EXCLUDED_AREAS[set.id] ?? [])
  })

  it('B-09 비교과: id 유일 · type 유효 · 그룹 키 존재 · level 스케일 정합', () => {
    const reqs = set.nonCurricular
    expect(duplicatesOf(reqs.map((r) => r.id))).toEqual([])
    for (const r of reqs) {
      expect(REQUIREMENT_TYPES.has(r.type), `${r.id}: type '${r.type}'`).toBe(true)
      if (r.pick != null) expect(r.pick >= 1, `${r.id}: pick`).toBe(true)
      for (const g of r.groups ?? []) {
        const missing = g.courses.filter((key) => !mergedKeys.has(key))
        expect(missing, `${r.id}/${g.id}: 카탈로그에 없는 키`).toEqual([])
      }
      // level 형은 scale 이 min 을 포함해야 한다 — 아니면 영구 미충족 데이터(6단계 엔진 가드와 짝).
      if (r.type === 'level') {
        expect(r.scale?.includes(String(r.min)), `${r.id}: scale 에 min '${r.min}' 없음`).toBe(true)
      }
      for (const alt of r.alternatives ?? []) {
        expect(ALTERNATIVE_TYPES.has(alt.type), `${r.id}/${alt.id}: type`).toBe(true)
        if (alt.type === 'level') {
          expect(
            alt.scale != null && alt.scale.length > 0 && alt.scale.includes(String(alt.min)),
            `${r.id}/${alt.id}: scale 에 min '${alt.min}' 없음`,
          ).toBe(true)
        }
      }
    }
  })

  it('B-10 equivalents: to 존재 · 의도된 dangling from 만 허용', () => {
    const eqs = set.equivalents ?? []
    expect(duplicatesOf(eqs.map((e) => e.id))).toEqual([])
    const dangling: string[] = []
    for (const eq of eqs) {
      expect(EQUIVALENT_TYPES.has(eq.type), `${eq.id}: type`).toBe(true)
      expect(EQUIVALENT_DIRECTIONS.has(eq.direction), `${eq.id}: direction`).toBe(true)
      expect(mergedKeys.has(eq.to), `${eq.id}: to '${eq.to}' 가 카탈로그에 없음`).toBe(true)
      if (!mergedKeys.has(eq.from)) dangling.push(eq.from)
    }
    expect([...new Set(dangling)].sort()).toEqual(DANGLING_EQUIVALENT_FROM[set.id] ?? [])
  })

  it('B-11 gradePoints: 9키 정확 · A+=4.5 · F=0', () => {
    if (!set.gradePoints) return
    expect(Object.keys(set.gradePoints).sort()).toEqual([...GRADE_POINT_KEYS].sort())
    for (const key of GRADE_POINT_KEYS) {
      expect(isFiniteNumber(set.gradePoints[key as keyof typeof set.gradePoints])).toBe(true)
    }
    expect(set.gradePoints['A+']).toBe(4.5)
    expect(set.gradePoints['F']).toBe(0)
  })

  it('B-12 총계: totalCredits·minGPA 양의 숫자, Σ버킷 minCredits ≤ totalCredits', () => {
    expect(isFiniteNumber(set.totalCredits) && set.totalCredits > 0).toBe(true)
    expect(isFiniteNumber(set.minGPA) && set.minGPA >= 0).toBe(true)
    const sum = set.buckets
      .filter((b) => b.countsTowardTotal !== false)
      .reduce((acc, b) => acc + b.minCredits, 0)
    expect(sum, `Σ minCredits ${sum} > totalCredits ${set.totalCredits}`).toBeLessThanOrEqual(
      set.totalCredits,
    )
  })

  it('B-13 recognitionCaps 구조', () => {
    const caps = set.recognitionCaps ?? []
    expect(duplicatesOf(caps.map((c) => c.id))).toEqual([])
    for (const cap of caps) {
      expect(cap.states.length, `${cap.id}: states 비어 있음`).toBeGreaterThan(0)
      for (const st of cap.states) expect(COURSE_STATES.has(st), `${cap.id}: state '${st}'`).toBe(true)
      if (cap.maxRatioOfTotal != null) {
        expect(cap.maxRatioOfTotal > 0 && cap.maxRatioOfTotal <= 1, `${cap.id}: ratio`).toBe(true)
      }
      if (cap.maxCredits != null) expect(cap.maxCredits > 0, `${cap.id}: maxCredits`).toBe(true)
    }
  })

  it('B-14 majorPolicy·source 구조', () => {
    if (set.majorPolicy) {
      expect(Array.isArray(set.majorPolicy.satisfiedBy)).toBe(true)
      expect(set.majorPolicy.minAdditionalMajorCount).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(set.majorPolicy.exemptions)).toBe(true)
    }
    // 출처 표기: 어느 요람에서 왔는지는 모든 프리셋의 최소 의무.
    expect(isNonEmptyString(set.source?.['document']), 'source.document 없음').toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// C. 추가전공 규칙 무결성 — 전 번들
// ────────────────────────────────────────────────────────────

describe.each(ruleCases.map((r) => [r.id, r] as const))('추가전공 규칙 %s', (_id, r) => {
  it('C-01 id 유일 · type 유효 · 수치 필드 숫자', () => {
    expect(duplicatesOf(r.rules.map((x) => x.id))).toEqual([])
    for (const rule of r.rules) {
      expect(AM_TYPES.has(rule.type), `${rule.id}: type '${rule.type}'`).toBe(true)
      expect(isNonEmptyString(rule.name) && isNonEmptyString(rule.typeLabel), `${rule.id}`).toBe(true)
      expect(
        isFiniteNumber(rule.totalMinCredits) && rule.totalMinCredits >= 0,
        `${rule.id}: totalMinCredits`,
      ).toBe(true)
      expect(
        isFiniteNumber(rule.homeOverlapCap) && rule.homeOverlapCap >= 0,
        `${rule.id}: homeOverlapCap`,
      ).toBe(true)
      expect(typeof rule.satisfiesMajorPolicy, `${rule.id}: satisfiesMajorPolicy`).toBe('boolean')
      for (const g of rule.courseGroups ?? []) {
        expect(isFiniteNumber(g.minCredits) && g.minCredits >= 0, `${rule.id}/${g.id}`).toBe(true)
      }
    }
  })

  it('C-02 requiredCourses 키가 학과 카탈로그에 존재', () => {
    const dangling: string[] = []
    for (const rule of r.rules) {
      for (const key of rule.requiredCourses ?? []) {
        if (!r.catalogKeys.has(key)) dangling.push(`${rule.id} → ${key}`)
      }
    }
    expect(dangling).toEqual([])
  })
})
