/**
 * 2단계 번들 데이터(2024 SW) 검증.
 *
 * (A) 참조 무결성 — src/data JSON이 엔진 규칙을 만족하는지(런타임 가드).
 *     구조 무결성 A-계열(키 유일·참조 존재 등)은 data-invariants.test.ts(범용 스위트)로
 *     이관했고, 여기에는 2024 SW 고유 수치·사실(cohort) 검증만 남긴다.
 * (B) 심화·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * 2024 실질 변경(2023 대비):
 *  - 전공선택에서 네트워크보안및실습(SOS344)·시스템소프트웨어보안(SOS337) 제외(전선 소계 176→170)
 *  - 나머지(전공필수 11·산학 6군·현장실습 12학점 상한·인공지능입문 전필)는 2023과 동일
 *  - 프로그래밍 인증 문구: APC/Shake!/ACM-ICPC 입상실적
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, normalizeText } from '../index.js'
import type { Bucket, Course, CourseState, RequirementSet } from '../types.js'
import {
  catalog2024Sw,
  reqSet2024SwAdvanced,
  reqSet2024SwGeneral,
  additionalMajorRules2024Sw,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'
import {
  mk,
  advancedProfile,
  generalProfile,
  advancedNonCurricular,
  generalNonCurricular,
  AREA_TRIO_REAL,
} from './fixtures/builders.js'

const SETS: [string, RequirementSet][] = [
  ['advanced', reqSet2024SwAdvanced],
  ['general', reqSet2024SwGeneral],
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

const INTENDED_DANGLING_FROM = new Set(['SW-CREATIVE-SW-INTRO'])

const catalogKeys = new Set(catalog2024Sw.map((e) => e.courseKey))
const index = buildCatalogIndex(catalog2024Sw)

/**
 * 앱이 실제로 평가에 쓰는 카탈로그 — 학과 + 학번(2024)에 맞는 다산학부대학 교양.
 * 교양 키(GE-*)는 전부 여기서 온다. 두 세트는 영역별교양 영역 정의가 같아 하나로 쓴다.
 */
const mergedCatalog = catalogFor(catalog2024Sw, 2024, reqSet2024SwAdvanced)
const mergedKeys = new Set(mergedCatalog.map((e) => e.courseKey))

function getBucket(set: RequirementSet, id: string): Bucket {
  const b = set.buckets.find((x) => x.id === id)
  if (!b) throw new Error(`bucket ${id} 없음`)
  return b
}

function catEntry(key: string) {
  const e = catalog2024Sw.find((c) => c.courseKey === key)
  if (!e) throw new Error(`catalog ${key} 없음`)
  return e
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe('A. 참조 무결성 (2024 SW)', () => {
  describe.each(SETS)('세트=%s', (_name, set) => {
    it('A-05 영역별교양에 남은 과목의 area는 세트가 인정하는 영역뿐(제외 영역은 일반선택행)', () => {
      const areaIds = new Set((getBucket(set, 'area_liberal').areas ?? []).map((a) => a.id))
      const merged = catalogFor(catalog2024Sw, 2024, set)
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
      const catalogField = catalog2024Sw
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

    it('A-11 equivalents: to는 카탈로그 존재, from은 의도된 dangling만 허용', () => {
      for (const eq of set.equivalents ?? []) {
        expect(mergedKeys, `equivalent.to ${eq.to}`).toContain(eq.to)
        if (!mergedKeys.has(eq.from)) {
          expect(INTENDED_DANGLING_FROM, `dangling from ${eq.from}`).toContain(eq.from)
        }
      }
      const eq = (set.equivalents ?? []).find((e) => e.id === 'eq_creative_to_ai')!
      expect(eq.from).toBe('SW-CREATIVE-SW-INTRO')
      expect(eq.to).toBe('SW-AI-INTRO')
      expect(eq.effectiveFrom).toBe(2023)
    })

    it('A-14 totalCredits 140 / minGPA 2.0', () => {
      expect(set.totalCredits).toBe(140)
      expect(set.minGPA).toBe(2.0)
    })

  })

  it('A-06b 두 세트의 bucket id 집합이 동일', () => {
    const a = new Set(reqSet2024SwAdvanced.buckets.map((b) => b.id))
    const g = reqSet2024SwGeneral.buckets.map((b) => b.id)
    expect(g).toHaveLength(a.size)
    for (const id of g) expect(a).toContain(id)
  })

  it('A-14b major_elective만 minCredits가 다르고(37/10) 나머지는 동일', () => {
    for (const b of reqSet2024SwAdvanced.buckets) {
      const gb = getBucket(reqSet2024SwGeneral, b.id)
      if (b.id === 'major_elective') {
        expect(b.minCredits).toBe(37)
        expect(gb.minCredits).toBe(10)
      } else {
        expect(gb.minCredits, `${b.id}`).toBe(b.minCredits)
      }
    }
  })

  it('A-10 추가전공 규칙: type 유효 + homeOverlapCap 숫자 + requiredCourses 키 존재 + 자동차SW 제외', () => {
    for (const r of additionalMajorRules2024Sw) {
      expect(AM_TYPES, `${r.id} type`).toContain(r.type)
      expect(r.homeOverlapCap).toBeTypeOf('number')
      for (const key of r.requiredCourses ?? []) expect(catalogKeys).toContain(key)
    }
    expect(additionalMajorRules2024Sw.map((r) => r.id)).not.toContain('am_linked_autosw')
  })

  it('A-12 학수번호: SCE411 단독 + 인공지능입문 SCE104', () => {
    const byCode = (code: string) =>
      (index.byCode.get(normalizeText(code)) ?? []).map((e) => e.courseKey).sort()
    expect(byCode('SCE411')).toEqual(['SW-MODEL-SIM'])
    expect(byCode('SCE412')).toEqual(['SW-ADV-COMP-ARCH'])
    expect(byCode('SCE104')).toEqual(['SW-AI-INTRO'])
  })

  it('A-16 전공필수 교체 + 2024 제외 과목(네트워크보안및실습·시스템소프트웨어보안)', () => {
    for (const set of [reqSet2024SwAdvanced, reqSet2024SwGeneral]) {
      const req = getBucket(set, 'major_required').requiredCourses ?? []
      expect(req).toContain('SW-AI-INTRO')
      expect(req).not.toContain('SW-CREATIVE-SW-INTRO')
      expect(req).toHaveLength(11)
    }
    // 2024 제외 과목
    expect(catalogKeys.has('SW-NET-SEC'), 'SW-NET-SEC(네트워크보안및실습) 제외').toBe(false)
    expect(catalogKeys.has('SW-SYS-SW'), 'SW-SYS-SW(시스템소프트웨어보안) 제외').toBe(false)
    // 유지되는 보안 교차과목(디지털포렌식·블록체인·현대암호)
    expect(catalogKeys.has('SW-DIGITAL-FORENSICS')).toBe(true)
    expect(catalogKeys.has('SW-BLOCKCHAIN-IOT')).toBe(true)
    expect(catalogKeys.has('SW-CRYPTO')).toBe(true)
    // 창의소프트웨어입문·해외인턴십 없음
    expect(catalogKeys.has('SW-CREATIVE-SW-INTRO')).toBe(false)
    for (const k of ['SW-INTERN-1', 'SW-INTERN-6']) expect(catalogKeys.has(k), k).toBe(false)
  })

  it('A-17 산학 인증 과목군: field=SW현장실습1~6(6), intensive=IT+AI집중교육(4), 6군', () => {
    const fieldExpected = [
      'SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6',
    ].sort()
    const intensiveExpected = [
      'SW-IT-INTENSIVE-1', 'SW-IT-INTENSIVE-2', 'SW-AI-INTENSIVE-1', 'SW-AI-INTENSIVE-2',
    ].sort()
    for (const set of [reqSet2024SwAdvanced, reqSet2024SwGeneral]) {
      const ip = set.nonCurricular.find((r) => r.id === 'industry_project')
      expect([...(ip?.groups?.find((g) => g.id === 'field')?.courses ?? [])].sort()).toEqual(fieldExpected)
      expect([...(ip?.groups?.find((g) => g.id === 'intensive')?.courses ?? [])].sort()).toEqual(intensiveExpected)
      expect(ip?.groups).toHaveLength(6)
    }
  })

  it('A-18 현장실습 상한 12학점 + 멤버 10과목', () => {
    const expected = [
      'SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6',
      'SW-STARTUP-1', 'SW-STARTUP-2', 'SW-STARTUP-FIELD-1', 'SW-STARTUP-FIELD-2',
    ].sort()
    for (const set of [reqSet2024SwAdvanced, reqSet2024SwGeneral]) {
      const cg = (set.courseGroups ?? []).find((c) => c.id === 'field_practice')!
      expect(cg.creditCap).toBe(12)
      expect([...cg.courses].sort()).toEqual(expected)
    }
  })
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

function commonRequired2024(): Course[] {
  return [
    mk('GE-AJOU-CHARACTER'),
    mk('GE-ENGLISH-1'),
    mk('GE-ENGLISH-2'),
    mk('GE-WRITING'),
    ...AREA_TRIO_REAL.map((k) => mk(k)),
    mk('SW-CAREER-SEMINAR'),
    mk('MATH-1'),
    mk('MATH-2'),
    mk('MATH-PROB-1'),
    mk('MATH-LINEAR-1'),
    mk('SCI-PHYSICS'),
    mk('SCI-PHYSICS-LAB'),
    mk('SCI-CHEMISTRY'),
    mk('SW-PROGRAMMING', { credits: 4 }),
    mk('SW-DISCRETE-MATH', { credits: 3 }),
    mk('SW-AI-INTRO', { credits: 3 }),
    mk('SW-DIGITAL-CIRCUIT', { credits: 3 }),
    mk('SW-OOP', { credits: 4 }),
    mk('SW-DATA-STRUCT', { credits: 3 }),
    mk('SW-COMP-ARCH', { credits: 3 }),
    mk('SW-SYS-PROGRAMMING', { credits: 4 }),
    mk('SW-ALGORITHM', { credits: 3 }),
    mk('SW-NETWORK', { credits: 3 }),
    mk('SW-OS', { credits: 3 }),
  ]
}

const ADV_ELECTIVES_3 = [
  'SW-DB', 'SW-SW-ENG', 'SW-AI', 'SW-CV', 'SW-ML',
  'SW-COMPILER', 'SW-OSS-INTRO', 'SW-DISTRIBUTED', 'SW-CG',
]

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

const advProfile2024 = () =>
  advancedProfile({
    admissionYear: 2024,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2024SwAdvanced.id,
  })
const genProfile2024 = (over = {}) =>
  generalProfile({
    admissionYear: 2024,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2024SwGeneral.id,
    ...over,
  })

describe('B. 심화 대표 성적표 (2024 SW)', () => {
  function baseCourses(): Course[] {
    return [
      ...commonRequired2024(),
      mk('SW-CAPSTONE', { credits: 6 }),
      mk('SW-SELF-PROJECT', { credits: 3 }),
      ...ADV_ELECTIVES_3.map((k) => advElective(k)),
      mk('SW-IND-SEMINAR', { credits: 1 }),
      ...Array.from({ length: 9 }, (_, i) => filler(`교양${i + 1}`)),
      filler('교양-1학점', 1),
    ]
  }
  const base = {
    profile: advProfile2024(),
    requirementSet: reqSet2024SwAdvanced,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2024Sw,
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

describe('B. 일반 대표 성적표 (2024 SW)', () => {
  const genCommon: Course[] = [
    ...commonRequired2024(),
    advElective('SW-DB'),
    // 산학프로젝트 인증(2024 요람: 일반과정 1개 이상) 충족을 겸하는 전공선택
    mk('SW-SELF-PROJECT', { credits: 3 }),
    advElective('SW-AI'),
    mk('SW-IND-SEMINAR', { credits: 1 }),
    ...Array.from({ length: 11 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-1학점', 1),
  ]
  const base = {
    profile: genProfile2024({ additionalMajors: [{ ruleId: 'am_minor', active: true }] }),
    requirementSet: reqSet2024SwGeneral,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2024Sw,
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

  it('B-05 일반과정 산학프로젝트 인증 활성·1개로 충족 — 심화 전용 2종은 비활성 (2024 요람 기타 졸업요건)', () => {
    // 2024 요람은 2021·2022와 달리 "일반과정 이수자는 1개 이상"을 명시한다(R3b 정정).
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    const ip = r.nonCurricular.find((n) => n.id === 'industry_project')
    expect(ip?.active).toBe(true)
    expect(ip?.satisfied).toBe(true) // genCommon의 자기주도프로젝트 1개
    for (const id of ['major_ability', 'programming_cert']) {
      expect(r.nonCurricular.find((n) => n.id === id)?.active, id).toBe(false)
    }
    expect(r.nonCurricular.find((n) => n.id === 'english_cert')?.active).toBe(true)
  })

  it('B-05b 일반과정 산학 과목군 0개 → 산학프로젝트 미충족으로 졸업 불가', () => {
    // 자기주도프로젝트를 산학 그룹 밖 전공선택으로 바꾸면 학점 축은 그대로, 인증만 실패한다.
    const courses = [
      ...genCommon.filter((c) => c.courseKey !== 'SW-SELF-PROJECT'),
      advElective('SW-SW-ENG'),
      ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1)),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.credits.earned).toBe(140)
    const ip = r.nonCurricular.find((n) => n.id === 'industry_project')
    expect(ip?.active).toBe(true)
    expect(ip?.satisfied).toBe(false)
    expect(r.verdict).toBe('not_graduatable')
    expect(
      r.blockers.some((b) => b.category === 'non_curricular' && b.requirementId === 'industry_project')
    ).toBe(true)
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
