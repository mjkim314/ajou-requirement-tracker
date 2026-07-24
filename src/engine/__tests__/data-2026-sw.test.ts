/**
 * 2단계 번들 데이터(2026 SW) 검증.
 *
 * (A) 참조 무결성 — src/data JSON이 엔진 규칙을 만족하는지(런타임 가드).
 *     구조 무결성 A-계열(키 유일·참조 존재 등)은 data-invariants.test.ts(범용 스위트)로
 *     이관 — 여기 남은 A-절은 2026 고유 수치·신설/폐지 사실만 검증한다.
 * (B) 심화·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * 2026 실질 변경(2025 대비):
 *  - AI리터러시 3학점 신설(대학필수 22 → 25). 2026 전교 공통 대학필수지만 다산학부대학
 *    편제표에는 없고 각 학과가 개설한다(학과별 과목명 상이) → 학과 카탈로그 SW-AI-LITERACY
 *  - 전공필수 10과목 32학점 → 9과목 29학점 (인공지능입문이 교육과정에서 사라짐)
 *  - 전공기초에서 확률및통계2 폐지 → 확률및통계1·선형대수1 둘 다 필수(택1 구조 소멸)
 *  - 전공선택 신규 6과목(인공지능수학·AI와윤리·음성인식·언어모델·강화학습기초·계산복잡도이론),
 *    편성표 전공선택 소계 172 → 190
 *  - 외국어 표 TEPS 605 → 329(NEW TEPS 척도로 교체)
 *  - 총 졸업학점 128·현장실습 6학점 상한은 2025와 동일
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, normalizeText } from '../index.js'
import type {
  Bucket,
  Course,
  CourseState,
  NonCurricularState,
  RequirementSet,
} from '../types.js'
import {
  catalog2026Sw,
  reqSet2026SwAdvanced,
  reqSet2026SwGeneral,
  additionalMajorRules2026Sw,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'
import { mk, advancedProfile, generalProfile } from './fixtures/builders.js'

const SETS: [string, RequirementSet][] = [
  ['advanced', reqSet2026SwAdvanced],
  ['general', reqSet2026SwGeneral],
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

const catalogKeys = new Set(catalog2026Sw.map((e) => e.courseKey))
const index = buildCatalogIndex(catalog2026Sw)

const mergedCatalog = catalogFor(catalog2026Sw, 2026, reqSet2026SwAdvanced)
const mergedKeys = new Set(mergedCatalog.map((e) => e.courseKey))

const AREA_QUAD_2026 = [
  'GE-HP-WHAT-IS-HISTORY',
  'GE-LA-WHAT-IS-LITERATURE',
  'GE-HS-WHAT-IS-SOCIOLOGY',
  'GE-CI-ETHICS-OF-SCIENCE-AND-TECHNOLOGY',
]

function getBucket(set: RequirementSet, id: string): Bucket {
  const b = set.buckets.find((x) => x.id === id)
  if (!b) throw new Error(`bucket ${id} 없음`)
  return b
}

function catEntry(key: string) {
  const e = catalog2026Sw.find((c) => c.courseKey === key)
  if (!e) throw new Error(`catalog ${key} 없음`)
  return e
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe('A. 참조 무결성 (2026 SW)', () => {
  describe.each(SETS)('세트=%s', (_name, set) => {
    it('A-05 영역별교양 4영역 + 제외 영역(nat_sci)은 일반선택행', () => {
      const areaIds = new Set((getBucket(set, 'area_liberal').areas ?? []).map((a) => a.id))
      expect(areaIds).toEqual(new Set(['hist_phil', 'lit_art', 'human_soc', 'conn_integ']))
      const merged = catalogFor(catalog2026Sw, 2026, set)
      const excluded = merged.filter((e) => e.area != null && !areaIds.has(e.area))
      for (const e of merged) {
        if (e.defaultBucket !== 'area_liberal') continue
        expect(areaIds, `${e.courseKey} area ${e.area}`).toContain(e.area)
      }
      expect(excluded.length).toBeGreaterThan(0)
      for (const e of excluded) expect(e.defaultBucket, e.courseKey).toBe('general_elective')
      expect(new Set(excluded.map((e) => e.area))).toEqual(new Set(['nat_sci']))
    })

    it('A-08 industry_project field 그룹 === 카탈로그 field 태그 집합', () => {
      const catalogField = catalog2026Sw
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

    it('A-11 equivalents: from/to 모두 합성 카탈로그에 존재(dangling 없음)', () => {
      for (const eq of set.equivalents ?? []) {
        expect(mergedKeys, `equivalent.to ${eq.to}`).toContain(eq.to)
        expect(mergedKeys, `equivalent.from ${eq.from}`).toContain(eq.from)
      }
      expect((set.equivalents ?? []).map((e) => e.id)).not.toContain('eq_creative_to_ai')
    })

    it('A-14 totalCredits 128 / minGPA 2.0', () => {
      expect(set.totalCredits).toBe(128)
      expect(set.minGPA).toBe(2.0)
    })

    it('A-15 bucket minCredits 합 === totalCredits(요람 구성현황표와 일치)', () => {
      const sum = set.buckets.reduce((s, b) => s + b.minCredits, 0)
      expect(sum).toBe(set.totalCredits)
    })
  })

  it('A-06b 두 세트의 bucket id 집합이 동일', () => {
    const a = new Set(reqSet2026SwAdvanced.buckets.map((b) => b.id))
    const g = reqSet2026SwGeneral.buckets.map((b) => b.id)
    expect(g).toHaveLength(a.size)
    for (const id of g) expect(a).toContain(id)
  })

  it('A-14b 심화/일반 차이는 전공선택(32/10)·일반선택(22/44)뿐', () => {
    for (const b of reqSet2026SwAdvanced.buckets) {
      const gb = getBucket(reqSet2026SwGeneral, b.id)
      if (b.id === 'major_elective') {
        expect(b.minCredits).toBe(32)
        expect(gb.minCredits).toBe(10)
      } else if (b.id === 'general_elective') {
        expect(b.minCredits).toBe(22)
        expect(gb.minCredits).toBe(44)
      } else {
        expect(gb.minCredits, `${b.id}`).toBe(b.minCredits)
      }
    }
  })

  it('A-10 추가전공 규칙: type 유효 + homeOverlapCap 숫자 + 마이크로전공 보수 처리', () => {
    for (const r of additionalMajorRules2026Sw) {
      expect(AM_TYPES, `${r.id} type`).toContain(r.type)
      expect(r.homeOverlapCap).toBeTypeOf('number')
      for (const key of r.requiredCourses ?? []) expect(catalogKeys).toContain(key)
    }
    const micro = additionalMajorRules2026Sw.find((r) => r.id === 'am_micro')!
    expect(micro.satisfiesMajorPolicy).toBe(false)
  })

  it('A-12 학수번호: SCE411 단독, SCE214 시스템프로그래밍, 2026 신규 6종', () => {
    const byCode = (code: string) =>
      (index.byCode.get(normalizeText(code)) ?? []).map((e) => e.courseKey).sort()
    expect(byCode('SCE411')).toEqual(['SW-MODEL-SIM'])
    expect(byCode('SCE214')).toEqual(['SW-SYS-PROGRAMMING'])
    expect(byCode('SCE241')).toEqual(['SW-AI-MATH'])
    expect(byCode('SCE3321')).toEqual(['SW-AI-ETHICS'])
    expect(byCode('SCE438')).toEqual(['SW-SPEECH-RECOG'])
    expect(byCode('SCE4310')).toEqual(['SW-LANGUAGE-MODEL'])
    expect(byCode('SCE439')).toEqual(['SW-RL-INTRO'])
    expect(byCode('SCE437')).toEqual(['SW-COMPLEXITY'])
    // 인공지능입문(SCE104)은 2026 교육과정에서 사라졌다
    expect(byCode('SCE104')).toEqual([])
    expect(catalogKeys.has('SW-AI-INTRO')).toBe(false)
  })

  it('A-16 전공필수 9과목 29학점 + 인공지능입문 제외', () => {
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      const req = getBucket(set, 'major_required').requiredCourses ?? []
      expect(req).toHaveLength(9)
      expect(req).not.toContain('SW-AI-INTRO')
      expect(req).not.toContain('SW-DIGITAL-CIRCUIT')
      const sum = req.reduce((s, k) => s + catEntry(k).credits, 0)
      expect(sum).toBe(29)
      expect(getBucket(set, 'major_required').minCredits).toBe(29)
    }
  })

  it('A-17 AI리터러시 버킷 3학점 + SW 지정과목(학과 카탈로그 소속)', () => {
    // 다산 교양 편제표에 없고 학과마다 과목명이 달라 교양이 아니라 학과 카탈로그에 둔다
    expect(catEntry('SW-AI-LITERACY').defaultBucket).toBe('ai_literacy')
    expect(catEntry('SW-AI-LITERACY').credits).toBe(3)
    expect(catEntry('SW-AI-LITERACY').codes ?? []).toHaveLength(0)
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      const b = getBucket(set, 'ai_literacy')
      expect(b.group).toBe('university_required')
      expect(b.minCredits).toBe(3)
      expect(b.requiredCourses).toEqual(['SW-AI-LITERACY'])
    }
    // 대학필수 소계 25 = 마중물1 + 영어3 + 글쓰기3 + 아주상상3 + AI리터러시3 + 영역별교양12
    const uni = reqSet2026SwAdvanced.buckets
      .filter((b) => b.group === 'university_required')
      .reduce((s, b) => s + b.minCredits, 0)
    expect(uni).toBe(25)
  })

  it('A-18 현장실습 상한 6학점 + 멤버 10과목', () => {
    const expected = [
      'SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6',
      'SW-STARTUP-1', 'SW-STARTUP-2', 'SW-STARTUP-FIELD-1', 'SW-STARTUP-FIELD-2',
    ].sort()
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      const cg = (set.courseGroups ?? []).find((c) => c.id === 'field_practice')!
      expect(cg.creditCap).toBe(6)
      expect([...cg.courses].sort()).toEqual(expected)
    }
  })

  it('A-19 전공기초: 확률및통계2 폐지, 확통1·선대1 둘 다 필수(택1 없음)', () => {
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      const mb = getBucket(set, 'major_basic')
      expect(mb.minCredits).toBe(6)
      expect(mb.requiredCourses).toEqual(['MATH-PROB-1', 'MATH-LINEAR-1'])
      expect(mb.choiceGroups ?? []).toHaveLength(0)
      expect(getBucket(set, 'sw_seminar').minCredits + mb.minCredits).toBe(7)
    }
    expect(catalogKeys.has('MATH-PROB-2')).toBe(false)
  })

  it('A-20 영어 인증: TEPS 329(NEW TEPS)와 구 TEPS 605 병기', () => {
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      const alts = set.nonCurricular.find((n) => n.id === 'english_cert')?.alternatives ?? []
      const byId = Object.fromEntries(alts.map((a) => [a.id, a]))
      expect(byId['toeic']?.min).toBe(730)
      expect(byId['new_teps']?.min).toBe(329)
      expect(byId['teps']?.min).toBe(605)
      expect(byId['toeic_sp']?.min).toBe('IM1')
      expect(byId['opic']?.min).toBe('IL')
    }
  })

  it('A-21 전공 역량 인증이 check 타입', () => {
    for (const set of [reqSet2026SwAdvanced, reqSet2026SwGeneral]) {
      expect(set.nonCurricular.find((n) => n.id === 'major_ability')?.type).toBe('check')
    }
  })

  it('A-22 카탈로그 학점 합이 요람 인쇄 소계와 일치(전필 29 / 전선 190)', () => {
    const sum = (bucket: string) =>
      catalog2026Sw.filter((e) => e.defaultBucket === bucket).reduce((s, e) => s + e.credits, 0)
    expect(sum('major_required')).toBe(29)
    expect(sum('major_elective')).toBe(190)
  })

  it('A-23 creditBreakdown 합 === credits, 3열 합계가 요람 소계(이론116/설계28.5/실습45.5)', () => {
    const t = { theory: 0, design: 0, lab: 0 }
    for (const e of catalog2026Sw) {
      const cb = e.creditBreakdown
      if (cb) {
        const s = (cb.theory ?? 0) + (cb.design ?? 0) + (cb.lab ?? 0)
        expect(s, `${e.courseKey} breakdown`).toBe(e.credits)
      }
      if (e.defaultBucket !== 'major_elective') continue
      if (!cb) t.theory += e.credits
      else {
        t.theory += cb.theory ?? 0
        t.design += cb.design ?? 0
        t.lab += cb.lab ?? 0
      }
    }
    expect(t).toEqual({ theory: 116, design: 28.5, lab: 45.5 })
  })
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

function commonRequired2026(): Course[] {
  return [
    mk('GE-AJOU-IN-PRIMER', { credits: 1 }),
    mk('GE-ENGLISH', { credits: 3 }),
    mk('GE-WRITING', { credits: 3 }),
    mk('GE-AJOU-SANGSANG-HEALTH', { credits: 3 }),
    mk('SW-AI-LITERACY', { credits: 3 }),
    ...AREA_QUAD_2026.map((k) => mk(k, { credits: 3 })),
    mk('SW-CAREER-SEMINAR', { credits: 1 }),
    mk('MATH-1', { credits: 3 }),
    mk('MATH-2', { credits: 3 }),
    mk('MATH-PROB-1', { credits: 3 }),
    mk('MATH-LINEAR-1', { credits: 3 }),
    mk('SCI-PHYSICS', { credits: 3 }),
    mk('SCI-PHYSICS-LAB', { credits: 1 }),
    mk('SCI-CHEMISTRY', { credits: 3 }),
    mk('SW-PROGRAMMING', { credits: 4 }),
    mk('SW-DISCRETE-MATH', { credits: 3 }),
    mk('SW-OOP', { credits: 4 }),
    mk('SW-DATA-STRUCT', { credits: 3 }),
    mk('SW-COMP-ARCH', { credits: 3 }),
    mk('SW-ALGORITHM', { credits: 3 }),
    mk('SW-SYS-PROGRAMMING', { credits: 3 }),
    mk('SW-NETWORK', { credits: 3 }),
    mk('SW-OS', { credits: 3 }),
  ]
}

/** 대학필수 25 + 전공기초 7 + BSM 13 + 전공필수 29 = 74 */
const COMMON_CREDITS_2026 = 74

const ADV_ELECTIVES_3 = [
  'SW-DB', 'SW-SW-ENG', 'SW-AI', 'SW-CV', 'SW-ML',
  'SW-COMPILER', 'SW-OSS-INTRO', 'SW-CG',
]

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

function advElective(key: string, over: Partial<{ state: CourseState }> = {}): Course {
  return mk(key, {
    credits: 3,
    ...(over.state ? { state: over.state, grade: over.state === 'enrolled' ? null : 'A0' } : {}),
  })
}

function advancedNonCurricular2026(): NonCurricularState {
  return {
    english_cert: { alternatives: { opic: { level: 'IL' } } },
    major_ability: { done: true },
    programming_cert: { alternatives: { topcit: { score: 190 } } },
  }
}
function generalNonCurricular2026(): NonCurricularState {
  return { english_cert: { alternatives: { opic: { level: 'IL' } } } }
}

const advProfile2026 = () =>
  advancedProfile({
    admissionYear: 2026,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2026SwAdvanced.id,
  })
const genProfile2026 = (over = {}) =>
  generalProfile({
    admissionYear: 2026,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2026SwGeneral.id,
    ...over,
  })

describe('B. 심화 대표 성적표 (2026 SW)', () => {
  function baseCourses(): Course[] {
    return [
      ...commonRequired2026(),
      mk('SW-CAPSTONE', { credits: 6 }),
      mk('SW-SELF-PROJECT', { credits: 3 }),
      ...ADV_ELECTIVES_3.map((k) => advElective(k)),
      ...Array.from({ length: 7 }, (_, i) => filler(`교양${i + 1}`)),
      filler('교양-1학점', 1),
    ]
  }
  const base = {
    profile: advProfile2026(),
    requirementSet: reqSet2026SwAdvanced,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2026Sw,
    nonCurricularState: advancedNonCurricular2026(),
  }

  it('B-01 완성 성적표 → 졸업 가능, 전 영역 충족, blocker 0', () => {
    const r = evaluate({ ...base, courses: baseCourses() })
    expect(r.credits.earned).toBe(COMMON_CREDITS_2026 + 33 + 22)
    expect(r.credits.earned).toBeGreaterThanOrEqual(128)
    for (const b of r.buckets) expect(b.satisfied, b.id).toBe(true)
    expect(r.majorPolicy.required).toBe(false)
    expect(r.blockers).toHaveLength(0)
    expect(r.verdict).toBe('graduatable')
  })

  it('B-02 AI리터러시 누락 → 졸업 불가 + ai_literacy blocker', () => {
    const courses = baseCourses().filter((c) => c.courseKey !== 'SW-AI-LITERACY')
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('not_graduatable')
    expect(r.buckets.find((b) => b.id === 'ai_literacy')?.satisfied).toBe(false)
  })

  it('B-04 선형대수1 누락 → 전공기초 미충족(2026은 택1이 아니라 필수)', () => {
    const courses = baseCourses().filter((c) => c.courseKey !== 'MATH-LINEAR-1')
    const r = evaluate({ ...base, courses })
    expect(r.buckets.find((b) => b.id === 'major_basic')?.satisfied).toBe(false)
    expect(r.verdict).toBe('not_graduatable')
  })

  it('B-05 마지막 전공선택 과목 수강중 → 이번 학기 완료 예정', () => {
    const courses = [
      ...baseCourses().filter((c) => c.courseKey !== 'SW-CG'),
      filler('교양-보충', 3),
      advElective('SW-CG', { state: 'enrolled' }),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable_after_current')
  })

  it('B-06 2026 신규 과목도 전공선택으로 집계', () => {
    const courses = [
      ...baseCourses().filter((c) => c.courseKey !== 'SW-CG'),
      mk('SW-AI-MATH', { credits: 3 }),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.buckets.find((b) => b.id === 'major_elective')?.earned).toBe(33)
    expect(r.verdict).toBe('graduatable')
  })
})

describe('B. 일반 대표 성적표 (2026 SW)', () => {
  const genCommon: Course[] = [
    ...commonRequired2026(),
    advElective('SW-DB'),
    advElective('SW-SW-ENG'),
    advElective('SW-AI'),
    advElective('SW-CV'),
    ...Array.from({ length: 14 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-2학점', 2),
  ]
  const base = {
    profile: genProfile2026({ additionalMajors: [{ ruleId: 'am_minor', active: true }] }),
    requirementSet: reqSet2026SwGeneral,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2026Sw,
    nonCurricularState: generalNonCurricular2026(),
  }

  it('B-07 부전공 21학점 완성 → 졸업 가능 + 전공이수원칙 충족', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    expect(r.credits.earned).toBeGreaterThanOrEqual(128)
    expect(r.majorPolicy.required).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('B-08 일반과정은 인증 3종 비활성(영어만 적용)', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    for (const id of ['major_ability', 'industry_project', 'programming_cert']) {
      expect(r.nonCurricular.find((n) => n.id === id)?.active, id).toBe(false)
    }
    expect(r.nonCurricular.find((n) => n.id === 'english_cert')?.active).toBe(true)
  })

  it('B-09 마이크로전공 1건만으로는 전공 이수원칙 미충족(보수적 인코딩)', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({
      ...base,
      profile: genProfile2026({ additionalMajors: [{ ruleId: 'am_micro', active: true }] }),
      courses,
    })
    expect(r.majorPolicy.satisfied).toBe(false)
  })
})
