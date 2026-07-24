/**
 * 번들 데이터(공과대학 기계공학과 2021·2022) 검증.
 *
 * (A) 참조 무결성 — src/data JSON이 엔진 규칙을 만족하는지(런타임 가드).
 * (B) 공학인증·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * SW와 달리 두 학번을 한 파일에 담는다. 2021·2022는 요건 숫자가 완전히 같고
 * 과목명 개편(공업역학1→정역학 등)만 다르므로, 나란히 두어야 "무엇이 같고
 * 무엇이 다른지"가 테스트 자체로 드러난다.
 *
 * 기계공학과 고유 구조 두 가지가 SW 테스트와 다르다:
 *  - 과정이 심화/일반이 아니라 **공학인증(accredited)/일반(general)**이다.
 *  - 두 과정의 버킷 집합이 다르다. 요람이 인증과정에선 전산학 6학점을 한 칸으로,
 *    일반과정에선 계열별필수(SW) 3 + 전산학(SW) 3으로 쪼개 인쇄하기 때문이다.
 *    따라서 "과정별 bucket id 집합 동일" 검사는 하지 않고, 대신 두 과정 각각에
 *    대해 defaultBucket 유효성을 검사한다(범용 스위트 B-04).
 *
 * 구조 무결성 A-계열(구 A-01·A-06·A-07·A-08·A-13)은 data-invariants.test.ts
 * (범용 스위트)로 이관했다. 남은 A-절은 요람에서 읽은 학과·학번 고유 값 검증이다.
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, normalizeText } from '../index.js'
import type {
  AdditionalMajorRule,
  Bucket,
  CatalogEntry,
  Course,
  CourseState,
  Profile,
  RequirementSet,
} from '../types.js'
import {
  catalog2021Me,
  catalog2022Me,
  reqSet2021MeAccredited,
  reqSet2021MeGeneral,
  reqSet2022MeAccredited,
  reqSet2022MeGeneral,
  additionalMajorRules2021Me,
  additionalMajorRules2022Me,
  requirementSetRegistry,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'
import { mk } from './fixtures/builders.js'

interface YearData {
  year: number
  catalog: CatalogEntry[]
  accredited: RequirementSet
  general: RequirementSet
  rules: AdditionalMajorRule[]
  /** 계열별필수(SW) 과목 — 2021 융합프로그래밍1 / 2022 Python프로그래밍 */
  progKey: string
  /** 일반과정 영역별교양 3영역을 채우는 실제 교양 과목(요람 표기 기준) */
  generalAreaTrio: string[]
}

const YEARS: YearData[] = [
  {
    year: 2021,
    catalog: catalog2021Me,
    accredited: reqSet2021MeAccredited,
    general: reqSet2021MeGeneral,
    rules: additionalMajorRules2021Me,
    progKey: 'ME-CONV-PROG-1',
    // 2021 일반과정: 역사와철학 · 문학과예술 · 인간과사회
    generalAreaTrio: [
      'GE-HP-WHAT-IS-HISTORY',
      'GE-LA-WHAT-IS-LITERATURE',
      'GE-HS-WHAT-IS-SOCIOLOGY',
    ],
  },
  {
    year: 2022,
    catalog: catalog2022Me,
    accredited: reqSet2022MeAccredited,
    general: reqSet2022MeGeneral,
    rules: additionalMajorRules2022Me,
    progKey: 'ME-PYTHON-PROG',
    // 2022 일반과정: 역사와철학 · 인간과사회 · 자연과과학(요람 표기)
    generalAreaTrio: [
      'GE-HP-WHAT-IS-HISTORY',
      'GE-HS-WHAT-IS-SOCIOLOGY',
      'GE-NS-WHAT-IS-PHYSICS',
    ],
  },
]

const AM_TYPES = new Set([
  'double_major',
  'minor',
  'linked_major',
  'track',
  'micro_degree',
  'self_designed',
  'custom',
])

/** 공학인증 대상자가 이수해야 하는 학과 지정 전문교양(요람 인증과정 표 하단). */
const ABEEK_GE: Record<string, string[]> = {
  hist_phil: [
    'GE-HP-ETHICS-OF-CONTEMPORARY-SOCIETY',
    'GE-HP-WESTERN-INTELLECTUAL-HISTORY',
    'GE-HP-SCIENCE-AND-PHILOSOPHY',
  ],
  human_soc: [
    'GE-HS-CREATIVE-THINKING',
    'GE-HS-SCIENCE-TECHNOLOGY-AND-LAW',
    'GE-HS-FUTURE-REVOLUTION-AND-STARTUP',
  ],
  nat_sci: [
    'GE-NS-TECHNOLOGY-DEVELOPMENT-AND-SOCIETY',
    'GE-NS-HISTORY-OF-SCIENCE',
    'GE-NS-ENERGY-AND-SOCIETY',
  ],
}

/** 인증과정 대표 성적표가 쓰는 지정 교양 3과목(영역별 1개씩). */
const ABEEK_TRIO = [
  'GE-HP-ETHICS-OF-CONTEMPORARY-SOCIETY',
  'GE-HS-CREATIVE-THINKING',
  'GE-NS-TECHNOLOGY-DEVELOPMENT-AND-SOCIETY',
]

const MAJOR_REQ_11 = [
  'ME-ADVENTURE-DESIGN',
  'ME-STATICS',
  'ME-DRAWING',
  'ME-SOLID-MECH',
  'ME-THERMO',
  'ME-DYNAMICS',
  'ME-FLUID-MECH',
  'ME-LAB-BASIC',
  'ME-LAB-ADVANCED',
  'ME-CONV-DESIGN-IP',
  'ME-CAPSTONE',
]
const MAJOR_REQ_5 = [
  'ME-STATICS',
  'ME-SOLID-MECH',
  'ME-THERMO',
  'ME-DYNAMICS',
  'ME-FLUID-MECH',
]

/**
 * 요람 전공선택 표 첫 7행에 걸린 「최소 택3 필수」 병합셀 대상 과목.
 * 2021·2022 × 인증·일반 4개 표에 동일하게 나타난다(기초유한요소법부터는 범위 밖).
 */
const ELECTIVE_PICK3 = [
  'ME-MATERIALS',
  'ME-MANUFACTURING',
  'ME-HEAT-TRANSFER',
  'ME-VIBRATION',
  'ME-MECHANISM-DESIGN',
  'ME-MACHINE-DESIGN',
  'ME-SYSTEM-DYNAMICS',
]

/** 두 학번 모두에 존재하는 3학점 전공선택(학점 채움용). 앞 7개가 택3 대상이다. */
const ELECTIVES_3 = [...ELECTIVE_PICK3, 'ME-FEM', 'ME-ENGINE', 'ME-FLUID-POWER']

/** 택3 대상이 아닌 3학점 전공선택(택3 미충족 시나리오용). */
const NON_PICK3_ELECTIVES = [
  'ME-MEASUREMENT',
  'ME-APPLIED-SOLID',
  'ME-REFRIGERATION',
  'ME-MICROPROCESSOR',
  'ME-AUTOMOTIVE',
]

function bucketOf(set: RequirementSet, id: string): Bucket {
  const b = set.buckets.find((x) => x.id === id)
  if (!b) throw new Error(`bucket ${id} 없음 (${set.id})`)
  return b
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe.each(YEARS)('A. 참조 무결성 (기계공학과 $year)', (Y) => {
  const sets: [string, RequirementSet][] = [
    ['accredited', Y.accredited],
    ['general', Y.general],
  ]
  const catalogKeys = new Set(Y.catalog.map((e) => e.courseKey))
  const index = buildCatalogIndex(Y.catalog)

  it('A-02 세트 id·학과·대학·학번이 온보딩 매칭 값과 일치', () => {
    for (const [name, set] of sets) {
      expect(set.id).toBe(`rs_${Y.year}_me_${name}`)
      expect(set.department).toBe('기계공학과')
      expect(set.college).toBe('공과대학')
      expect(set.trackType).toBe(name)
      expect(set.admissionYearFrom).toBe(Y.year)
      expect(set.admissionYearTo).toBe(Y.year)
      // 레지스트리 등록 — 빠지면 온보딩이 프리셋을 못 찾는다.
      expect(requirementSetRegistry[set.id]).toBe(set)
    }
  })

  it('A-03 총학점·최저평점·평점표 (학칙 제50조1항1호·3항3호, 제46조6항)', () => {
    for (const [, set] of sets) {
      expect(set.totalCredits).toBe(128)
      expect(set.minGPA).toBe(2.0)
      expect(set.gradePoints?.['A+']).toBe(4.5)
      expect(set.gradePoints?.['F']).toBe(0)
      expect(Object.keys(set.gradePoints ?? {}).sort()).toEqual(
        ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F'].sort()
      )
    }
  })

  it('A-04 버킷 minCredits 합 === totalCredits(128)', () => {
    for (const [name, set] of sets) {
      const sum = set.buckets.reduce((a, b) => a + b.minCredits, 0)
      expect(sum, `${name} 버킷 합`).toBe(set.totalCredits)
    }
  })

  it('A-05 요람 「1. 졸업 이수학점 및 구성 현황」 소계 스냅샷', () => {
    // 인증과정: 대학필수 2 · 전문교양 18 · MSC 30 · 전공 60(인필 28 + 인선 32)
    const acc = Y.accredited
    expect(bucketOf(acc, 'ajou_hope').minCredits + bucketOf(acc, 'ajou_character').minCredits).toBe(2)
    expect(
      bucketOf(acc, 'english').minCredits +
        bucketOf(acc, 'writing').minCredits +
        bucketOf(acc, 'area_liberal').minCredits
    ).toBe(18)
    expect(
      bucketOf(acc, 'math').minCredits +
        bucketOf(acc, 'science_basic').minCredits +
        bucketOf(acc, 'computing').minCredits
    ).toBe(30)
    expect(bucketOf(acc, 'major_required').minCredits).toBe(28)
    expect(bucketOf(acc, 'major_elective').minCredits).toBe(32)

    // 일반과정: 대학필수 20 · 계열별필수(SW) 3 · 학과필수 27 · 전공 42(전필 15 + 전선 27)
    const gen = Y.general
    expect(
      bucketOf(gen, 'ajou_hope').minCredits +
        bucketOf(gen, 'ajou_character').minCredits +
        bucketOf(gen, 'english').minCredits +
        bucketOf(gen, 'writing').minCredits +
        bucketOf(gen, 'area_liberal').minCredits
    ).toBe(20)
    expect(bucketOf(gen, 'sw_required').minCredits).toBe(3)
    expect(
      bucketOf(gen, 'math').minCredits +
        bucketOf(gen, 'science_basic').minCredits +
        bucketOf(gen, 'computing').minCredits
    ).toBe(27)
    expect(bucketOf(gen, 'major_required').minCredits).toBe(15)
    expect(bucketOf(gen, 'major_elective').minCredits).toBe(27)
  })

  it('A-09 영역별교양: 인정 영역만 남고 제외 영역은 일반선택으로 이동', () => {
    for (const [name, set] of sets) {
      const areaIds = new Set((bucketOf(set, 'area_liberal').areas ?? []).map((a) => a.id))
      expect(areaIds.size, `${name} 영역 수`).toBe(3)
      expect(bucketOf(set, 'area_liberal').minDistinctAreas).toBe(3)
      const merged = catalogFor(Y.catalog, Y.year, set)
      const excluded = merged.filter((e) => e.area != null && !areaIds.has(e.area))
      for (const e of merged) {
        if (e.defaultBucket !== 'area_liberal') continue
        expect(areaIds, `${name} ${e.courseKey} area ${e.area}`).toContain(e.area)
      }
      expect(excluded.length, `${name} 제외 영역 과목`).toBeGreaterThan(0)
      for (const e of excluded) expect(e.defaultBucket, e.courseKey).toBe('general_elective')
    }
  })

  it('A-10 인증과정만 ABEEK 지정 교양 택1 그룹을 갖고, 지정 과목의 area가 요람 영역과 일치', () => {
    const acc = bucketOf(Y.accredited, 'area_liberal')
    expect(new Set((acc.areas ?? []).map((a) => a.id))).toEqual(
      new Set(['hist_phil', 'human_soc', 'nat_sci'])
    )
    expect(acc.choiceGroups ?? []).toHaveLength(3)
    const ge = new Map(catalogFor(Y.catalog, Y.year, Y.accredited).map((e) => [e.courseKey, e]))
    for (const g of acc.choiceGroups ?? []) {
      const area = g.id.replace(/^abeek_/, '')
      expect(ABEEK_GE[area], `${g.id} 영역`).toBeDefined()
      expect(g.courses).toEqual(ABEEK_GE[area])
      for (const key of g.courses) {
        expect(ge.get(key)?.area, `${key} area`).toBe(area)
        expect(ge.get(key)?.credits, `${key} credits`).toBe(3)
      }
    }
    // 일반과정에는 지정 제한이 없다.
    expect(bucketOf(Y.general, 'area_liberal').choiceGroups ?? []).toHaveLength(0)
  })

  it('A-11 전공필수: 인증 11과목 28학점 / 일반 5과목 15학점, 나머지 6과목은 일반과정 전공선택', () => {
    const credits = new Map(Y.catalog.map((e) => [e.courseKey, e.credits]))
    const acc = bucketOf(Y.accredited, 'major_required').requiredCourses ?? []
    const gen = bucketOf(Y.general, 'major_required').requiredCourses ?? []
    expect([...acc].sort()).toEqual([...MAJOR_REQ_11].sort())
    expect([...gen].sort()).toEqual([...MAJOR_REQ_5].sort())
    expect(acc.reduce((a, k) => a + (credits.get(k) ?? 0), 0)).toBe(28)
    expect(gen.reduce((a, k) => a + (credits.get(k) ?? 0), 0)).toBe(15)
    // 두 과정에서 이수구분이 갈리는 6과목은 일반과정에서 전공선택으로 떨어진다.
    for (const key of MAJOR_REQ_11.filter((k) => !MAJOR_REQ_5.includes(k))) {
      expect(Y.catalog.find((e) => e.courseKey === key)?.defaultBucket, key).toBe('major_elective')
    }
  })

  it('A-11b 전공선택 「최소 택3 필수」 — 요람 병합셀 7과목이 4개 세트 모두에 pick 3으로', () => {
    for (const [name, set] of sets) {
      const groups = bucketOf(set, 'major_elective').choiceGroups ?? []
      expect(groups, `${name} 택3 그룹`).toHaveLength(1)
      const g = groups[0]!
      expect(g.id).toBe('core_elective_pick3')
      expect(g.pick).toBe(3)
      expect([...g.courses].sort()).toEqual([...ELECTIVE_PICK3].sort())
      // 기초유한요소법은 병합셀 범위 밖 — 넣으면 요람보다 느슨해진다.
      expect(g.courses).not.toContain('ME-FEM')
      for (const key of g.courses) {
        expect(catalogKeys, `${name} ${key}`).toContain(key)
      }
    }
  })

  it('A-12 학과필수 과목 구성과 학점 합(수학 12 · 기초과학 12 · 전산학)', () => {
    const credits = new Map(Y.catalog.map((e) => [e.courseKey, e.credits]))
    const sum = (keys: string[]) => keys.reduce((a, k) => a + (credits.get(k) ?? 0), 0)
    expect(sum(bucketOf(Y.accredited, 'math').requiredCourses ?? [])).toBe(12)
    expect(sum(bucketOf(Y.accredited, 'science_basic').requiredCourses ?? [])).toBe(12)
    // 인증과정 전산학 6 = 수치해석 3 + 프로그래밍 3
    expect(sum(bucketOf(Y.accredited, 'computing').requiredCourses ?? [])).toBe(6)
    expect(bucketOf(Y.accredited, 'computing').requiredCourses).toContain(Y.progKey)
    // 일반과정은 같은 6학점이 계열별필수(SW) 3 + 전산학(SW) 3으로 갈린다.
    expect(bucketOf(Y.general, 'sw_required').requiredCourses).toEqual([Y.progKey])
    expect(bucketOf(Y.general, 'computing').requiredCourses).toEqual(['ME-NUMERICAL'])
  })

  it('A-14 인증필수 설계학점 9 — 요람 「설계 12학점 이상」의 출발점', () => {
    const byKey = new Map(Y.catalog.map((e) => [e.courseKey, e]))
    const design = MAJOR_REQ_11.reduce(
      (a, k) => a + (byKey.get(k)?.creditBreakdown?.design ?? 0),
      0
    )
    expect(design).toBe(9)
    // 나머지 3학점 이상은 인증선택에서 채워야 하므로 자동 판정 대신 직접 확인 항목으로 둔다.
    expect(Y.accredited.nonCurricular.find((r) => r.id === 'design_credits')?.type).toBe('check')
    expect(Y.general.nonCurricular.find((r) => r.id === 'design_credits')).toBeUndefined()
  })

  it('A-15 학수번호: 중복 부여 없음, 개명 과목은 학번별 코드를 각각 보유', () => {
    const codes = Y.catalog.flatMap((e) => e.codes ?? [])
    expect(new Set(codes).size, '학수번호 중복').toBe(codes.length)
    const byKey = new Map(Y.catalog.map((e) => [e.courseKey, e]))
    // 공업역학1(MECH112, 2021) ↔ 정역학(MECH104, 2022) — 같은 courseKey, 다른 코드·이름
    expect(byKey.get('ME-STATICS')?.codes).toEqual([Y.year === 2021 ? 'MECH112' : 'MECH104'])
    expect(byKey.get('ME-STATICS')?.name).toBe(Y.year === 2021 ? '공업역학1' : '정역학')
    expect(byKey.get('ME-DYNAMICS')?.codes).toEqual([Y.year === 2021 ? 'MECH203' : 'MECH2013'])
    expect(byKey.get('ME-DYNAMICS')?.name).toBe(Y.year === 2021 ? '공업역학2' : '동역학')
    // 개편 전후 이름으로 검색해도 찾히도록 aliases에 반대편 표기를 넣었다.
    expect(byKey.get('ME-STATICS')?.aliases).toContain(Y.year === 2021 ? '정역학' : '공업역학1')
    // 카탈로그 인덱스가 코드로도 찾을 수 있어야 한다(byCode 키는 정규화된 문자열).
    expect(
      index.byCode.get(normalizeText(Y.year === 2021 ? 'MECH112' : 'MECH104'))?.[0]?.courseKey
    ).toBe('ME-STATICS')
  })

  it('A-16 선수과목 키가 카탈로그에 존재(요람 선수과목표 6건)', () => {
    const prereqs = Y.catalog.filter((e) => (e.prerequisites ?? []).length > 0)
    expect(prereqs).toHaveLength(6)
    for (const e of prereqs) {
      for (const p of e.prerequisites ?? []) {
        expect(catalogKeys, `${e.courseKey} prerequisite ${p}`).toContain(p)
      }
    }
  })

  it('A-17 equivalents: to는 합성 카탈로그에 존재, from은 의도된 교양 대체뿐', () => {
    for (const [name, set] of sets) {
      const merged = new Set(catalogFor(Y.catalog, Y.year, set).map((e) => e.courseKey))
      for (const eq of set.equivalents ?? []) {
        expect(merged, `${name} ${eq.id}.to ${eq.to}`).toContain(eq.to)
        expect(['GE-ENGLISH-ADV-1', 'GE-ENGLISH-ADV-2'], `${name} ${eq.id}.from`).toContain(eq.from)
      }
    }
  })

  it('A-18 비교과: 어학인증은 항상 적용, 별표1 12종 전체', () => {
    for (const [name, set] of sets) {
      const cert = set.nonCurricular.find((r) => r.id === 'english_cert')
      expect(cert, name).toBeDefined()
      expect(cert?.appliesWhen ?? null).toBeNull()
      expect(cert?.pick).toBe(1)
      expect(cert?.alternatives).toHaveLength(12)
      const byId = new Map((cert?.alternatives ?? []).map((a) => [a.id, a]))
      expect(byId.get('toeic')?.min).toBe(730)
      expect(byId.get('new_teps')?.min).toBe(329)
      expect(byId.get('teps')?.min).toBe(605)
      expect(byId.get('ielts')?.min).toBe(5.5)
      // level 타입은 scale 안에 min이 있어야 판정된다(없으면 영구 미충족).
      for (const alt of cert?.alternatives ?? []) {
        if (alt.type !== 'level') continue
        expect(alt.scale, `${alt.id} scale`).toContain(alt.min)
      }
    }
  })

  it('A-19 전공 이수원칙: 인증과정은 추가전공 불필요, 일반과정은 필수', () => {
    for (const [, set] of sets) {
      expect(set.majorPolicy?.requiredWhen).toEqual({
        field: 'trackType',
        op: 'neq',
        value: 'accredited',
      })
      expect(set.majorPolicy?.minAdditionalMajorCount).toBe(1)
      expect(set.majorPolicy?.exemptions).toEqual(['dual_degree', 'linked_masters'])
    }
  })

  it('A-20 추가전공 규칙 type 유니온·중복상한', () => {
    expect(Y.rules.length).toBeGreaterThan(0)
    expect(new Set(Y.rules.map((r) => r.id)).size).toBe(Y.rules.length)
    for (const r of Y.rules) {
      expect(AM_TYPES, `${r.id} type ${r.type}`).toContain(r.type)
      expect(typeof r.homeOverlapCap).toBe('number')
      expect(typeof r.totalMinCredits).toBe('number')
      for (const key of r.requiredCourses ?? []) {
        expect(catalogKeys, `${r.id} requiredCourses ${key}`).toContain(key)
      }
    }
    // 학사운영규칙 제23조: 부전공 전공 21학점 이상(전교 공통)
    expect(Y.rules.find((r) => r.id === 'am_minor')?.totalMinCredits).toBe(21)
    expect(Y.rules.find((r) => r.id === 'am_double')?.totalMinCredits).toBe(36)
    // 제23조의2 1항의 12~15는 부칙 제2조1항상 2025학년도 이후 교육과정부터 적용 —
    // 2021·2022학번에는 쓸 수 없어 연계전공 규칙 제5조3항의 9를 잠정값으로 둔다(SW 세트와 동일).
    expect(Y.rules.find((r) => r.id === 'am_micro')?.totalMinCredits).toBe(9)
    // 복수/부전공만 전공 이수원칙을 충족한다(제20조3항 — 트랙·마이크로 1건은 대체 불가).
    expect(Y.rules.filter((r) => r.satisfiesMajorPolicy).map((r) => r.id).sort()).toEqual([
      'am_double',
      'am_minor',
      'am_self_designed',
    ])
  })

  it('A-21 인정학점 합산 상한(학칙 제45조2항)', () => {
    for (const [, set] of sets) {
      const cap = set.recognitionCaps?.find((c) => c.id === 'cap_recognized_credits')
      expect(cap?.maxRatioOfTotal).toBe(0.5)
      expect(cap?.states).toEqual(['transferred', 'credited'])
    }
  })

  it('A-22 출처 표기 — 미검증 항목이 남아 있으므로 verified:false', () => {
    for (const [, set] of sets) {
      expect(set.source?.document).toContain('기계공학과')
      expect(set.source?.verified).toBe(false)
      expect((set.source?.notes as string[] | undefined ?? []).length).toBeGreaterThan(0)
    }
  })
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

/** courseKey 없는 채움 과목 → 폴백으로 일반선택에 귀속. */
function filler(label: string, credits = 3, state: CourseState = 'completed'): Course {
  return mk(null, {
    nameSnapshot: label,
    credits,
    state,
    ...(state === 'enrolled' ? { grade: null } : {}),
  })
}

function minorCourse(i: number): Course {
  return mk(null, { nameSnapshot: `부전공${i}`, credits: 3, countsToward: ['am_minor'] })
}

describe.each(YEARS)('B. 대표 성적표 (기계공학과 $year)', (Y) => {
  const credits = new Map(Y.catalog.map((e) => [e.courseKey, e.credits]))
  /** 카탈로그 실학점으로 수강 기록을 만든다(픽스처 학점맵을 쓰지 않도록). */
  const take = (key: string, state: CourseState = 'completed'): Course =>
    mk(key, {
      credits: credits.get(key) ?? 3,
      state,
      ...(state === 'enrolled' ? { grade: null } : {}),
    })

  const geRequired = (): Course[] => [
    mk('GE-AJOU-HOPE', { credits: 1 }),
    mk('GE-AJOU-CHARACTER', { credits: 1 }),
    mk('GE-ENGLISH-1', { credits: 3 }),
    mk('GE-ENGLISH-2', { credits: 3 }),
    mk('GE-WRITING', { credits: 3 }),
  ]
  const mscRequired = (progKey: string): Course[] =>
    [
      'MATH-1',
      'MATH-2',
      'MATH-ENG-A',
      'MATH-ENG-E',
      'SCI-PHYSICS-1',
      'SCI-PHYSICS-LAB-1',
      'SCI-PHYSICS-2',
      'SCI-PHYSICS-LAB-2',
      'SCI-CHEMISTRY',
      'SCI-CHEMISTRY-LAB',
      'ME-NUMERICAL',
      progKey,
    ].map((k) => take(k))

  const profile = (track: 'accredited' | 'general', over: Partial<Profile> = {}): Profile => ({
    schemaVersion: 2,
    admissionYear: Y.year,
    college: '공과대학',
    department: '기계공학과',
    trackType: track,
    requirementSetId: track === 'accredited' ? Y.accredited.id : Y.general.id,
    additionalMajors: [],
    exemptions: [],
    currentSemester: `${Y.year + 3}-1`,
    targetGraduation: `${Y.year + 3}-2`,
    onboardingCompleted: true,
    ...over,
  })

  const englishOnly = () => ({ english_cert: { alternatives: { opic: { level: 'IL' } } } })

  // ── 공학인증과정 ──
  describe('공학인증과정', () => {
    const base = {
      profile: profile('accredited'),
      requirementSet: Y.accredited,
      catalog: catalogFor(Y.catalog, Y.year, Y.accredited),
      additionalMajorRules: Y.rules,
      nonCurricularState: {
        ...englishOnly(),
        design_credits: { done: true },
      },
    }

    /**
     * 128학점 완성본.
     * 교양필수 11 + 영역별교양 9 + 수학 12 + 기초과학 12 + 전산학 6
     * + 전공필수 28 + 전공선택 32(3학점×10 + 자동차전자제어 2) + 일반선택 18
     */
    function baseCourses(): Course[] {
      return [
        ...geRequired(),
        ...ABEEK_TRIO.map((k) => mk(k, { credits: 3 })),
        ...mscRequired(Y.progKey),
        ...MAJOR_REQ_11.map((k) => take(k)),
        ...ELECTIVES_3.map((k) => take(k)),
        take('ME-AUTO-ELECTRONICS'),
        ...Array.from({ length: 6 }, (_, i) => filler(`교양${i + 1}`)),
      ]
    }

    it('B-01 완성 성적표 → 졸업 가능, 128학점, 전 영역 충족, blocker 0', () => {
      const r = evaluate({ ...base, courses: baseCourses() })
      expect(r.credits.earned).toBe(128)
      for (const b of r.buckets) expect(b.satisfied, b.id).toBe(true)
      expect(r.majorPolicy.required).toBe(false)
      expect(r.blockers).toHaveLength(0)
      expect(r.verdict).toBe('graduatable')
    })

    it('B-02 전공선택 3학점 부족 → 졸업 불가 + 전공선택 미충족', () => {
      const courses = baseCourses().filter((c) => c.courseKey !== 'ME-FLUID-POWER')
      const r = evaluate({ ...base, courses })
      expect(r.credits.earned).toBe(125)
      expect(r.buckets.find((b) => b.id === 'major_elective')?.satisfied).toBe(false)
      expect(r.verdict).toBe('not_graduatable')
    })

    it('B-03 마지막 과목 수강중 → 이번 학기 완료 예정', () => {
      const courses = [
        ...baseCourses().filter((c) => c.courseKey !== 'ME-FLUID-POWER'),
        take('ME-FLUID-POWER', 'enrolled'),
      ]
      expect(evaluate({ ...base, courses }).verdict).toBe('graduatable_after_current')
    })

    it('B-04 전공필수 누락(융합캡스톤디자인) → 전공필수 미충족', () => {
      const courses = baseCourses().filter((c) => c.courseKey !== 'ME-CAPSTONE')
      const r = evaluate({ ...base, courses })
      const mr = r.buckets.find((b) => b.id === 'major_required')
      expect(mr?.satisfied).toBe(false)
      // missingCourses는 courseKey가 아니라 표시용 과목명을 담는다.
      expect(mr?.missingCourses ?? []).toContain('융합캡스톤디자인')
      expect(r.verdict).toBe('not_graduatable')
    })

    it('B-05 학과 지정 외 교양으로는 영역별교양 미충족(학점은 채워져도 택1 그룹 실패)', () => {
      const courses = [
        ...baseCourses().filter((c) => !ABEEK_TRIO.includes(c.courseKey ?? '')),
        // 영역은 맞지만 학과가 지정하지 않은 과목들
        mk('GE-HP-WHAT-IS-HISTORY', { credits: 3 }),
        mk('GE-HS-WHAT-IS-SOCIOLOGY', { credits: 3 }),
        mk('GE-NS-WHAT-IS-PHYSICS', { credits: 3 }),
      ]
      const r = evaluate({ ...base, courses })
      const area = r.buckets.find((b) => b.id === 'area_liberal')
      expect(area?.earned).toBe(9) // 학점은 채워진다
      expect(area?.satisfied).toBe(false) // 지정과목 택1 3그룹이 미충족
      expect(r.verdict).toBe('not_graduatable')
    })

    it('B-06 학부연구프로젝트는 전공선택이 아니라 일반선택으로 이월(교양 1학점 인정)', () => {
      const r = evaluate({ ...base, courses: [...baseCourses(), take('ME-UG-RESEARCH-1')] })
      expect(r.buckets.find((b) => b.id === 'major_elective')?.earned).toBe(32)
      expect(r.buckets.find((b) => b.id === 'general_elective')?.earned).toBe(19)
      expect(r.credits.earned).toBe(129)
    })

    it('B-06b 「최소 택3 필수」 미충족 — 학점을 다 채워도 전공선택 미충족', () => {
      // 택3 대상 7과목 중 2개만 남기고 나머지 5개를 비대상 3학점 과목으로 교체(학점 32 유지).
      const dropped = ELECTIVE_PICK3.slice(2)
      const courses = [
        ...baseCourses().filter((c) => !dropped.includes(c.courseKey ?? '')),
        ...NON_PICK3_ELECTIVES.map((k) => take(k)),
      ]
      const r = evaluate({ ...base, courses })
      const me = r.buckets.find((b) => b.id === 'major_elective')
      expect(r.credits.earned).toBe(128) // 학점은 그대로
      expect(me?.earned).toBe(32) // 전공선택 학점도 충족
      expect(me?.satisfied).toBe(false) // 그런데 택3 그룹이 미충족
      expect(r.verdict).toBe('not_graduatable')
    })

    it('B-06c 택3 대상 3과목이면 충족', () => {
      const dropped = ELECTIVE_PICK3.slice(3)
      const courses = [
        ...baseCourses().filter((c) => !dropped.includes(c.courseKey ?? '')),
        ...NON_PICK3_ELECTIVES.slice(0, 4).map((k) => take(k)),
      ]
      const r = evaluate({ ...base, courses })
      expect(r.buckets.find((b) => b.id === 'major_elective')?.satisfied).toBe(true)
      expect(r.verdict).toBe('graduatable')
    })

    it('B-06d 전공선택 41학점 초과 이수 — 초과 9학점이 잔여(일반선택)로 집계돼 졸업 가능(백로그 #10)', () => {
      // 개편 R3a 재현 케이스: 전공선택 32 대신 41을 채우고 일반선택은 9만 이수(총 128 유지).
      // 암묵 이월 전에는 "일반선택 9학점 부족"으로 졸업 불가 오판이 났다.
      const courses = [
        ...baseCourses().filter((c) => !['교양4', '교양5', '교양6'].includes(c.nameSnapshot)),
        ...NON_PICK3_ELECTIVES.slice(0, 3).map((k) => take(k)),
      ]
      const r = evaluate({ ...base, courses })
      expect(r.credits.earned).toBe(128)
      const me = r.buckets.find((b) => b.id === 'major_elective')!
      const ge = r.buckets.find((b) => b.id === 'general_elective')!
      expect(me.earned).toBe(41)
      expect(ge.earned).toBe(9) // earned는 실제 귀속 학점 그대로
      expect(ge.carriedIn).toBe(9)
      expect(ge.satisfied).toBe(true)
      expect(ge.notes[0]).toContain('전공선택 초과 9학점')
      expect(r.verdict).toBe('graduatable')
    })

    it('B-07 어학인증 미충족이면 학점을 다 채워도 졸업 불가(학칙 제50조3항4호)', () => {
      const r = evaluate({
        ...base,
        nonCurricularState: { design_credits: { done: true } },
        courses: baseCourses(),
      })
      expect(r.credits.earned).toBe(128)
      expect(r.nonCurricular.find((n) => n.id === 'english_cert')?.satisfied).toBe(false)
      expect(r.verdict).toBe('not_graduatable')
    })
  })

  // ── 일반과정 ──
  describe('일반과정', () => {
    const base = {
      profile: profile('general', {
        additionalMajors: [{ ruleId: 'am_minor', active: true }],
      }),
      requirementSet: Y.general,
      catalog: catalogFor(Y.catalog, Y.year, Y.general),
      additionalMajorRules: Y.rules,
      nonCurricularState: englishOnly(),
    }

    /**
     * 128학점 완성본.
     * 교양필수 11 + 영역별교양 9 + 계열별필수 3 + 수학 12 + 기초과학 12 + 전산학 3
     * + 전공필수 15 + 전공선택 27(3학점×9) + 일반선택 36(부전공 21 + 교양 15)
     */
    function baseCourses(): Course[] {
      return [
        ...geRequired(),
        ...Y.generalAreaTrio.map((k) => mk(k, { credits: 3 })),
        ...mscRequired(Y.progKey),
        ...MAJOR_REQ_5.map((k) => take(k)),
        ...ELECTIVES_3.slice(0, 9).map((k) => take(k)),
        ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1)),
        ...Array.from({ length: 5 }, (_, i) => filler(`교양${i + 1}`)),
      ]
    }

    it('B-08 부전공 21학점 완성 → 졸업 가능 + 전공 이수원칙 충족', () => {
      const r = evaluate({ ...base, courses: baseCourses() })
      expect(r.credits.earned).toBe(128)
      for (const b of r.buckets) expect(b.satisfied, b.id).toBe(true)
      expect(r.majorPolicy.required).toBe(true)
      expect(r.majorPolicy.satisfied).toBe(true)
      expect(r.additionalMajors.find((m) => m.id === 'am_minor')?.satisfied).toBe(true)
      expect(r.verdict).toBe('graduatable')
    })

    it('B-09 추가전공 없이 학점만 채우면 졸업 불가(전공 이수원칙 미충족)', () => {
      const courses = [
        ...baseCourses().filter((c) => !(c.countsToward ?? []).includes('am_minor')),
        ...Array.from({ length: 7 }, (_, i) => filler(`교양추가${i + 1}`)),
      ]
      const r = evaluate({
        ...base,
        profile: profile('general'),
        courses,
      })
      expect(r.credits.earned).toBe(128)
      expect(r.majorPolicy.required).toBe(true)
      expect(r.majorPolicy.satisfied).toBe(false)
      expect(r.blockers.some((b) => b.category === 'major_policy')).toBe(true)
      expect(r.verdict).toBe('not_graduatable')
    })

    it('B-10 인증과정 전용 전필 6과목은 일반과정에서 전공선택으로 집계', () => {
      const extras = MAJOR_REQ_11.filter((k) => !MAJOR_REQ_5.includes(k))
      const r = evaluate({ ...base, courses: [...baseCourses(), ...extras.map((k) => take(k))] })
      const me = r.buckets.find((b) => b.id === 'major_elective')
      // Adventure Design 3 + 공학제도 1 + 기초실험 1 + 응용실험 2 + 융합설계 3 + 캡스톤 3 = 13
      expect(me?.earned).toBe(27 + 13)
      expect(r.buckets.find((b) => b.id === 'major_required')?.earned).toBe(15)
    })

    it('B-11 학부연구프로젝트는 일반과정에서 전공선택 1학점', () => {
      const r = evaluate({ ...base, courses: [...baseCourses(), take('ME-UG-RESEARCH-1')] })
      expect(r.buckets.find((b) => b.id === 'major_elective')?.earned).toBe(28)
    })
  })
})

// ────────────────────────────────────────────────────────────
// C. 학번별 고유 규칙
// ────────────────────────────────────────────────────────────

describe('C. 2021 고유 — 공학인턴십은 1만 전공선택', () => {
  const byKey = new Map(catalog2021Me.map((e) => [e.courseKey, e]))

  it('C-01 공학인턴십1은 전공선택, 2~6은 교양선택(일반선택)', () => {
    expect(byKey.get('ME-INTERN-1')?.defaultBucket).toBe('major_elective')
    for (const i of [2, 3, 4, 5, 6]) {
      expect(byKey.get(`ME-INTERN-${i}`)?.defaultBucket, `ME-INTERN-${i}`).toBe('general_elective')
    }
  })

  it('C-02 인턴십 상한 courseGroup은 두지 않는다(카탈로그 귀속으로 이미 구분됨)', () => {
    for (const set of [reqSet2021MeAccredited, reqSet2021MeGeneral]) {
      expect((set.courseGroups ?? []).map((g) => g.id)).not.toContain('engineering_internship')
    }
  })

  it('C-03 2022에서 폐지된 소성가공·기계학습원리가 2021에는 있다', () => {
    expect(byKey.has('ME-PLASTICITY')).toBe(true)
    expect(byKey.has('ME-ML-PRINCIPLES')).toBe(true)
    const k2022 = new Set(catalog2022Me.map((e) => e.courseKey))
    expect(k2022.has('ME-PLASTICITY')).toBe(false)
    expect(k2022.has('ME-ML-PRINCIPLES')).toBe(false)
  })
})

describe('C. 2022 고유 — 공학인턴십 전공선택 3학점 상한', () => {
  const credits = new Map(catalog2022Me.map((e) => [e.courseKey, e.credits]))

  it('C-04 인턴십 6과목이 모두 전공선택 기본 귀속 + creditCap 3 과목군', () => {
    for (let i = 1; i <= 6; i += 1) {
      const e = catalog2022Me.find((x) => x.courseKey === `ME-INTERN-${i}`)
      expect(e?.defaultBucket, `ME-INTERN-${i}`).toBe('major_elective')
      expect(e?.credits).toBe(3)
    }
    for (const set of [reqSet2022MeAccredited, reqSet2022MeGeneral]) {
      const g = (set.courseGroups ?? []).find((x) => x.id === 'engineering_internship')
      expect(g?.creditCap, set.id).toBe(3)
      expect(g?.capBucket).toBe('major_elective')
      expect(g?.overflowTo).toBe('general_elective')
      expect(g?.courses).toHaveLength(6)
    }
  })

  it('C-05 인턴십 6과목(18학점) 수강 → 전공선택 3 + 일반선택 15', () => {
    const take = (key: string): Course => mk(key, { credits: credits.get(key) ?? 3 })
    const courses = [
      mk('GE-AJOU-HOPE', { credits: 1 }),
      mk('GE-AJOU-CHARACTER', { credits: 1 }),
      mk('GE-ENGLISH-1', { credits: 3 }),
      mk('GE-ENGLISH-2', { credits: 3 }),
      mk('GE-WRITING', { credits: 3 }),
      ...ABEEK_TRIO.map((k) => mk(k, { credits: 3 })),
      ...[
        'MATH-1', 'MATH-2', 'MATH-ENG-A', 'MATH-ENG-E',
        'SCI-PHYSICS-1', 'SCI-PHYSICS-LAB-1', 'SCI-PHYSICS-2', 'SCI-PHYSICS-LAB-2',
        'SCI-CHEMISTRY', 'SCI-CHEMISTRY-LAB', 'ME-NUMERICAL', 'ME-PYTHON-PROG',
      ].map(take),
      ...MAJOR_REQ_11.map(take),
      ...ELECTIVES_3.map(take),
      take('ME-AUTO-ELECTRONICS'),
      ...Array.from({ length: 6 }, (_, i) => i + 1).map((i) => take(`ME-INTERN-${i}`)),
      // 인턴십 이월분(15)만으로는 일반선택 18에 3 모자라므로 교양 1과목을 더한다.
      mk(null, { nameSnapshot: '교양', credits: 3 }),
    ]
    const r = evaluate({
      profile: {
        schemaVersion: 2,
        admissionYear: 2022,
        college: '공과대학',
        department: '기계공학과',
        trackType: 'accredited',
        requirementSetId: reqSet2022MeAccredited.id,
        additionalMajors: [],
        exemptions: [],
        currentSemester: '2025-1',
        targetGraduation: '2025-2',
        onboardingCompleted: true,
      },
      requirementSet: reqSet2022MeAccredited,
      catalog: catalogFor(catalog2022Me, 2022, reqSet2022MeAccredited),
      courses,
      additionalMajorRules: additionalMajorRules2022Me,
      nonCurricularState: {
        english_cert: { alternatives: { opic: { level: 'IL' } } },
        design_credits: { done: true },
      },
    })
    // 상한은 인턴십 과목군의 전공선택 귀속분에만 걸린다 — 일반 전공선택 32는 그대로 남고
    // 인턴십 18학점 중 3만 더해져 35, 나머지 15는 일반선택으로 이월된다(15 + 교양 3 = 18).
    expect(r.buckets.find((b) => b.id === 'major_elective')?.earned).toBe(35)
    expect(r.buckets.find((b) => b.id === 'general_elective')?.earned).toBe(18)
    expect(r.credits.earned).toBe(131)
    expect(r.verdict).toBe('graduatable')
  })

  it('C-06 2022 신설 과목(수치열전달·고급수치해석)이 2021에는 없다', () => {
    const k2021 = new Set(catalog2021Me.map((e) => e.courseKey))
    for (const key of ['ME-NUMERICAL-HEAT', 'ME-ADV-NUMERICAL']) {
      expect(credits.has(key), `2022 ${key}`).toBe(true)
      expect(k2021.has(key), `2021 ${key}`).toBe(false)
    }
  })
})
