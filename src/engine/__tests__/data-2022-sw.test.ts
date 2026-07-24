/**
 * 2단계 번들 데이터(2022 SW) 검증.
 *
 * (A) 참조 무결성 — 학번 고유 사실(요람 수치·중복 인코딩·산학 과목군)만 남긴다.
 *     구조 무결성 A-계열은 data-invariants.test.ts(범용 스위트)로 이관.
 * (B) 심화·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * 2021 data.test.ts와 독립. 2022는 캡스톤디자인·IT집중교육1/2가 6학점, 임베디드
 * 소프트웨어가 3학점으로 정정된 점이 2021과의 실질 차이(카탈로그 note 참조).
 * builders.ts의 mk/commonRequired는 픽스처 학점맵 기반이라, 2022에서 값이 바뀐
 * 전공선택은 mk(key,{credits})로 학점을 명시한다.
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, normalizeText } from '../index.js'
import type { Bucket, Course, CourseState, RequirementSet } from '../types.js'
import {
  catalog2022Sw,
  reqSet2022SwAdvanced,
  reqSet2022SwGeneral,
  additionalMajorRules2022Sw,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'
import {
  mk,
  commonRequired,
  advancedProfile,
  generalProfile,
  advancedNonCurricular,
  generalNonCurricular,
  AREA_TRIO_REAL,
} from './fixtures/builders.js'

const SETS: [string, RequirementSet][] = [
  ['advanced', reqSet2022SwAdvanced],
  ['general', reqSet2022SwGeneral],
]

const catalogKeys = new Set(catalog2022Sw.map((e) => e.courseKey))
const index = buildCatalogIndex(catalog2022Sw)

/**
 * 앱이 실제로 평가에 쓰는 카탈로그 — 학과 + 학번(2022)에 맞는 다산학부대학 교양.
 * 교양 키(GE-*)는 전부 여기서 온다. 두 세트는 영역별교양 영역 정의가 같아 하나로 쓴다.
 */
const mergedCatalog = catalogFor(catalog2022Sw, 2022, reqSet2022SwAdvanced)
const mergedKeys = new Set(mergedCatalog.map((e) => e.courseKey))

function getBucket(set: RequirementSet, id: string): Bucket {
  const b = set.buckets.find((x) => x.id === id)
  if (!b) throw new Error(`bucket ${id} 없음`)
  return b
}

function catEntry(key: string) {
  const e = catalog2022Sw.find((c) => c.courseKey === key)
  if (!e) throw new Error(`catalog ${key} 없음`)
  return e
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe('A. 참조 무결성 (2022 SW)', () => {
  describe.each(SETS)('세트=%s', (_name, set) => {
    it('A-05 영역별교양에 남은 과목의 area는 세트가 인정하는 영역뿐(제외 영역은 일반선택행)', () => {
      const areaIds = new Set((getBucket(set, 'area_liberal').areas ?? []).map((a) => a.id))
      const merged = catalogFor(catalog2022Sw, 2022, set)
      const excluded = merged.filter((e) => e.area != null && !areaIds.has(e.area))
      for (const e of merged) {
        if (e.defaultBucket !== 'area_liberal') continue
        expect(areaIds, `${e.courseKey} area ${e.area}`).toContain(e.area)
      }
      // 이공계(SW)는 자연과 과학이 소속 영역 → 제외. 제외 과목은 사라지지 않고 일반선택으로 간다.
      expect(excluded.length).toBeGreaterThan(0)
      for (const e of excluded) expect(e.defaultBucket, e.courseKey).toBe('general_elective')
      expect(new Set(excluded.map((e) => e.area))).toEqual(new Set(['nat_sci']))
    })

    it('A-08 industry_project field 그룹 === 카탈로그 field 태그 집합', () => {
      const catalogField = catalog2022Sw
        .filter((e) => (e.courseGroups ?? []).includes('field'))
        .map((e) => e.courseKey)
        .sort()
      const ip = set.nonCurricular.find((r) => r.id === 'industry_project')
      const fieldGroup = ip?.groups?.find((g) => g.id === 'field')?.courses ?? []
      expect([...fieldGroup].sort()).toEqual(catalogField)
      for (const g of ip?.groups ?? []) {
        for (const key of g.courses) expect(catalogKeys, `${g.id} ${key}`).toContain(key)
      }
    })

    it('A-11 equivalents: 교양 대체 3건뿐(학번 개정·ICT 교차과목은 2022에 없음)', () => {
      // 고급영어1/2 → 영어1/2, 아주희망 → SW커리어세미나. 전공 대체는 2022 세트에 없다.
      expect((set.equivalents ?? []).map((e) => e.id).sort()).toEqual([
        'eq_adv_english_1',
        'eq_adv_english_2',
        'eq_ajou_hope_sw',
      ])
      for (const eq of set.equivalents ?? []) {
        expect(mergedKeys, `equivalent.to ${eq.to}`).toContain(eq.to)
        expect(mergedKeys, `equivalent.from ${eq.from}`).toContain(eq.from)
      }
    })

    it('A-14 totalCredits 140 / minGPA 2.0', () => {
      expect(set.totalCredits).toBe(140)
      expect(set.minGPA).toBe(2.0)
    })
  })

  it('A-06b 두 세트의 bucket id 집합이 동일', () => {
    const a = new Set(reqSet2022SwAdvanced.buckets.map((b) => b.id))
    const g = reqSet2022SwGeneral.buckets.map((b) => b.id)
    expect(g).toHaveLength(a.size)
    for (const id of g) expect(a).toContain(id)
  })

  it('A-14b major_elective만 minCredits가 다르고(37/10) 나머지는 동일', () => {
    for (const b of reqSet2022SwAdvanced.buckets) {
      const gb = getBucket(reqSet2022SwGeneral, b.id)
      if (b.id === 'major_elective') {
        expect(b.minCredits).toBe(37)
        expect(gb.minCredits).toBe(10)
      } else {
        expect(gb.minCredits, `${b.id}`).toBe(b.minCredits)
      }
    }
  })

  it('A-12 학수번호 중복 인코딩 의도 고정', () => {
    const byCode = (code: string) =>
      (index.byCode.get(normalizeText(code)) ?? []).map((e) => e.courseKey).sort()
    // 같은 학수번호 → 서로 다른 두 과목 (ambiguous 의도)
    expect(byCode('SCE411')).toEqual(['SW-ADV-COMP-ARCH', 'SW-MODEL-SIM'])
    // 같은 과목 → 두 학수번호 (단일 키로 수렴)
    expect(byCode('SCE205')).toEqual(['SW-DATA-STRUCT'])
    expect(byCode('SCE202')).toEqual(['SW-DATA-STRUCT'])
  })

  it('A-16 2022 학점 정정 스냅샷(캡스톤/IT집중교육 6, 임베디드 3)', () => {
    expect(catEntry('SW-CAPSTONE').credits).toBe(6)
    expect(catEntry('SW-IT-INTENSIVE-1').credits).toBe(6)
    expect(catEntry('SW-IT-INTENSIVE-2').credits).toBe(6)
    expect(catEntry('SW-EMBEDDED').credits).toBe(3)
  })

  it('A-17 산학 현장실습과목군은 정확히 8과목(요람 p342: SW현장실습1~6·해외인턴십1,2)', () => {
    const expected = [
      'SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6',
      'SW-INTERN-1', 'SW-INTERN-2',
    ].sort()
    for (const set of [reqSet2022SwAdvanced, reqSet2022SwGeneral]) {
      const field = set.nonCurricular
        .find((r) => r.id === 'industry_project')
        ?.groups?.find((g) => g.id === 'field')?.courses ?? []
      expect([...field].sort()).toEqual(expected)
    }
    // 창업현장실습·해외인턴십3~6은 산학 인증 field 그룹에 없어야 함(6학점 상한 대상일 뿐)
    for (const key of ['SW-STARTUP-FIELD-1', 'SW-STARTUP-FIELD-2', 'SW-INTERN-3', 'SW-INTERN-4', 'SW-INTERN-5', 'SW-INTERN-6']) {
      expect(expected).not.toContain(key)
      expect(catEntry(key).courseGroups ?? []).not.toContain('field')
    }
  })

  it('A-18 해외인턴십 학수번호(1·3=INF0401, 2·4=INF0402, 5=INF0407, 6=INF0408)', () => {
    expect(catEntry('SW-INTERN-1').codes).toEqual(['INF0401'])
    expect(catEntry('SW-INTERN-3').codes).toEqual(['INF0401'])
    expect(catEntry('SW-INTERN-2').codes).toEqual(['INF0402'])
    expect(catEntry('SW-INTERN-4').codes).toEqual(['INF0402'])
    expect(catEntry('SW-INTERN-5').codes).toEqual(['INF0407'])
    expect(catEntry('SW-INTERN-6').codes).toEqual(['INF0408'])
  })
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

/** 3학점 비-field 전공선택(산학 그룹과 무관) — 학점 채움용. */
const ADV_ELECTIVES_3 = [
  'SW-DB', 'SW-SW-ENG', 'SW-AI', 'SW-CV', 'SW-ML',
  'SW-COMPILER', 'SW-OSS-INTRO', 'SW-DISTRIBUTED', 'SW-CG',
]

/** courseKey 없는 일반선택 채움(폴백 → general_elective). */
function filler(label: string, credits = 3, state: CourseState = 'completed'): Course {
  return mk(null, {
    nameSnapshot: label,
    credits,
    state,
    ...(state === 'enrolled' ? { grade: null } : {}),
  })
}

function minorCourse(i: number, state: CourseState = 'completed'): Course {
  return mk(null, {
    nameSnapshot: `부전공${i}`,
    credits: 3,
    countsToward: ['am_minor'],
    state,
    ...(state === 'enrolled' ? { grade: null } : {}),
  })
}

function advElective(key: string, over: Partial<{ state: CourseState }> = {}): Course {
  return mk(key, {
    credits: 3,
    ...(over.state ? { state: over.state, grade: over.state === 'enrolled' ? null : 'A0' } : {}),
  })
}

const advProfile2022 = () =>
  advancedProfile({
    admissionYear: 2022,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2022SwAdvanced.id,
  })
const genProfile2022 = (over = {}) =>
  generalProfile({
    admissionYear: 2022,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2022SwGeneral.id,
    ...over,
  })

describe('B. 심화 대표 성적표 (2022 SW)', () => {
  // 전공선택 37 = 캡스톤6 + 자기주도3 + 3학점 전선 9과목(27) + 산업세미나1 = 37
  // 일반선택 28 = 3학점 9 + 1학점 1
  function baseCourses(): Course[] {
    return [
      ...commonRequired(AREA_TRIO_REAL),
      mk('SW-CAPSTONE', { credits: 6 }),
      mk('SW-SELF-PROJECT', { credits: 3 }),
      ...ADV_ELECTIVES_3.map((k) => advElective(k)),
      mk('SW-IND-SEMINAR', { credits: 1 }),
      ...Array.from({ length: 9 }, (_, i) => filler(`교양${i + 1}`)),
      filler('교양-1학점', 1),
    ]
  }
  const base = {
    profile: advProfile2022(),
    requirementSet: reqSet2022SwAdvanced,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2022Sw,
    nonCurricularState: advancedNonCurricular(),
  }

  it('B-01 완성 성적표 → 졸업 가능, 140학점, 전 영역 충족, blocker 0', () => {
    const r = evaluate({ ...base, courses: baseCourses() })
    expect(r.verdict).toBe('graduatable')
    expect(r.credits.earned).toBe(140)
    for (const b of r.buckets) expect(b.satisfied, b.id).toBe(true)
    expect(r.majorPolicy.required).toBe(false)
    expect(r.gpa.overall).toBeCloseTo(4.0, 5)
    expect(r.blockers).toHaveLength(0)
  })

  it('B-02 전공선택 미달(3학점 부족) → 졸업 불가 + 전공선택 blocker', () => {
    // SW-CG 제거 → 전공선택 34 < 37, 총 137. 산학·캡스톤은 유지되어 전공선택 축만 실패.
    const courses = baseCourses().filter((c) => c.courseKey !== 'SW-CG')
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('not_graduatable')
    expect(r.credits.earned).toBe(137)
    expect(r.buckets.find((b) => b.id === 'major_elective')?.satisfied).toBe(false)
    expect(r.blockers.length).toBeGreaterThan(0)
  })

  it('B-03 마지막 전공선택 과목 수강중 → 이번 학기 완료 예정', () => {
    const courses = [
      ...baseCourses().filter((c) => c.courseKey !== 'SW-CG'),
      advElective('SW-CG', { state: 'enrolled' }),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable_after_current')
  })
})

describe('B. 일반 대표 성적표 (2022 SW)', () => {
  // 필수(75) + 전공선택 10(SW-DB,SW-SW-ENG,SW-AI,SW산업세미나) + 교양 34 + 부전공 21
  const genCommon: Course[] = [
    ...commonRequired(AREA_TRIO_REAL),
    advElective('SW-DB'),
    advElective('SW-SW-ENG'),
    advElective('SW-AI'),
    mk('SW-IND-SEMINAR', { credits: 1 }),
    ...Array.from({ length: 11 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-1학점', 1),
  ]
  const base = {
    profile: genProfile2022({ additionalMajors: [{ ruleId: 'am_minor', active: true }] }),
    requirementSet: reqSet2022SwGeneral,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2022Sw,
    nonCurricularState: generalNonCurricular(),
  }

  it('B-04 부전공 21학점 완성 → 졸업 가능 + 전공이수원칙 충족', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable')
    expect(r.credits.earned).toBe(140)
    expect(r.majorPolicy.required).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.additionalMajors.find((m) => m.id === 'am_minor')?.satisfied).toBe(true)
  })

  it('B-05 일반과정은 인증 3종 비활성(영어만 적용)', () => {
    // 2022 요람 원문: "기타 졸업요건 (심화과정 이수 시 필수)" — 3종 전부 심화 전용이 맞다.
    // 2023·2024만 "일반과정 1개 이상"으로 바뀐다(R3b에서 해당 학번만 정정, 백로그 #4).
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    for (const id of ['major_ability', 'industry_project', 'programming_cert']) {
      expect(r.nonCurricular.find((n) => n.id === id)?.active, id).toBe(false)
    }
    expect(r.nonCurricular.find((n) => n.id === 'english_cert')?.active).toBe(true)
  })

  it('B-06 부전공 18학점(미완성) → 졸업 불가(전공 이수원칙 미충족)', () => {
    const courses = [
      ...genCommon,
      ...Array.from({ length: 6 }, (_, i) => minorCourse(i + 1)),
      filler('교양-추가', 3),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.credits.earned).toBe(140)
    expect(r.verdict).toBe('not_graduatable')
    expect(r.majorPolicy.satisfied).toBe(false)
    expect(r.blockers.some((b) => b.category === 'major_policy')).toBe(true)
  })
})
