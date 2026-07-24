/**
 * 2단계 번들 데이터(2025 SW) 검증.
 *
 * (A) 참조 무결성 — src/data JSON이 엔진 규칙을 만족하는지(런타임 가드).
 *     구조 무결성 A-계열(키 유일·참조 존재·타입 유효 등)은 data-invariants.test.ts
 *     (범용 스위트)로 이관 — 여기에는 2025 고유 수치(cohort) 검증만 남긴다.
 * (B) 심화·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * 2025 실질 변경(2024 대비) — 학번 개편이 커서 항목별로 못 박아 둔다:
 *  - 총 졸업학점 140 → 128
 *  - 교양 대개편: 영어 6→3(단일 영어), 글쓰기→대학글쓰기, 아주인성→아주인 마중물,
 *    아주상상프로젝트 3학점 신설, 영역별교양 9→12학점·3영역→4영역(conn_integ 추가)
 *  - 전공필수 11과목 36학점 → 10과목 32학점 (디지털회로가 전공선택으로 이동)
 *  - 시스템프로그래밍및실습 4학점 → 시스템프로그래밍 3학점 (학수번호 SCE214 동일)
 *  - 확률및통계·선형대수가 BSM 수학 → 전공기초(major_basic)로 분리, SW커리어세미나도 전공기초로
 *  - 현장실습 과목군 전공선택 인정 상한 12 → 6학점
 *  - 전공 역량 인증이 '2회'(count) → 단일 항목(check)
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
  catalog2025Sw,
  reqSet2025SwAdvanced,
  reqSet2025SwGeneral,
  additionalMajorRules2025Sw,
} from '../../data/index.js'
import { catalogFor } from '../../data/merge.js'
import { mk, advancedProfile, generalProfile } from './fixtures/builders.js'

const SETS: [string, RequirementSet][] = [
  ['advanced', reqSet2025SwAdvanced],
  ['general', reqSet2025SwGeneral],
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

const catalogKeys = new Set(catalog2025Sw.map((e) => e.courseKey))
const index = buildCatalogIndex(catalog2025Sw)

/** 앱이 실제로 평가에 쓰는 카탈로그 — 학과 + 학번(2025)에 맞는 다산학부대학 교양. */
const mergedCatalog = catalogFor(catalog2025Sw, 2025, reqSet2025SwAdvanced)
const mergedKeys = new Set(mergedCatalog.map((e) => e.courseKey))

/** 2025 영역별교양 4영역(소속 영역 nat_sci 제외) 각 1과목. */
const AREA_QUAD_2025 = [
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
  const e = catalog2025Sw.find((c) => c.courseKey === key)
  if (!e) throw new Error(`catalog ${key} 없음`)
  return e
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe('A. 참조 무결성 (2025 SW)', () => {
  describe.each(SETS)('세트=%s', (_name, set) => {
    it('A-05 영역별교양 4영역 + 제외 영역(nat_sci)은 일반선택행', () => {
      const areaIds = new Set((getBucket(set, 'area_liberal').areas ?? []).map((a) => a.id))
      expect(areaIds).toEqual(new Set(['hist_phil', 'lit_art', 'human_soc', 'conn_integ']))
      const merged = catalogFor(catalog2025Sw, 2025, set)
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
      const catalogField = catalog2025Sw
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
      // 2025는 창의소프트웨어입문 대체규칙(eq_creative_to_ai)을 더 이상 싣지 않는다
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
    const a = new Set(reqSet2025SwAdvanced.buckets.map((b) => b.id))
    const g = reqSet2025SwGeneral.buckets.map((b) => b.id)
    expect(g).toHaveLength(a.size)
    for (const id of g) expect(a).toContain(id)
  })

  it('A-14b 심화/일반 차이는 전공선택(32/10)·일반선택(22/44)뿐', () => {
    for (const b of reqSet2025SwAdvanced.buckets) {
      const gb = getBucket(reqSet2025SwGeneral, b.id)
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

  it('A-10 추가전공 규칙: type 유효 + homeOverlapCap 숫자 + requiredCourses 키 존재', () => {
    for (const r of additionalMajorRules2025Sw) {
      expect(AM_TYPES, `${r.id} type`).toContain(r.type)
      expect(r.homeOverlapCap).toBeTypeOf('number')
      for (const key of r.requiredCourses ?? []) expect(catalogKeys).toContain(key)
    }
    // 마이크로전공 2개 이상 규정은 엔진 미표현 → 보수적으로 false 유지
    const micro = additionalMajorRules2025Sw.find((r) => r.id === 'am_micro')!
    expect(micro.satisfiesMajorPolicy).toBe(false)
  })

  it('A-12 학수번호: SCE411 단독 + 시스템프로그래밍 SCE214 유지', () => {
    const byCode = (code: string) =>
      (index.byCode.get(normalizeText(code)) ?? []).map((e) => e.courseKey).sort()
    expect(byCode('SCE411')).toEqual(['SW-MODEL-SIM'])
    expect(byCode('SCE412')).toEqual(['SW-ADV-COMP-ARCH'])
    expect(byCode('SCE104')).toEqual(['SW-AI-INTRO'])
    expect(byCode('SCE214')).toEqual(['SW-SYS-PROGRAMMING'])
  })

  it('A-16 전공필수 10과목 32학점 + 디지털회로는 전공선택', () => {
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      const req = getBucket(set, 'major_required').requiredCourses ?? []
      expect(req).toHaveLength(10)
      expect(req).toContain('SW-AI-INTRO')
      expect(req).not.toContain('SW-DIGITAL-CIRCUIT')
      const sum = req.reduce((s, k) => s + catEntry(k).credits, 0)
      expect(sum).toBe(32)
      expect(getBucket(set, 'major_required').minCredits).toBe(32)
    }
    expect(catEntry('SW-DIGITAL-CIRCUIT').defaultBucket).toBe('major_elective')
  })

  it('A-17 시스템프로그래밍 3학점(2024 4학점에서 축소) + aliases 유지', () => {
    const e = catEntry('SW-SYS-PROGRAMMING')
    expect(e.name).toBe('시스템프로그래밍')
    expect(e.credits).toBe(3)
    expect(e.codes).toEqual(['SCE214'])
    expect(e.aliases).toContain('시스템프로그래밍및실습')
  })

  it('A-18 현장실습 상한 6학점(2024 12학점에서 축소) + 멤버 10과목', () => {
    const expected = [
      'SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6',
      'SW-STARTUP-1', 'SW-STARTUP-2', 'SW-STARTUP-FIELD-1', 'SW-STARTUP-FIELD-2',
    ].sort()
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      const cg = (set.courseGroups ?? []).find((c) => c.id === 'field_practice')!
      expect(cg.creditCap).toBe(6)
      expect([...cg.courses].sort()).toEqual(expected)
    }
  })

  it('A-19 전공기초 분리: 수학 6(수학1·2) / major_basic 6(확통1 + 택1) / 세미나 1', () => {
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      const math = getBucket(set, 'math')
      expect(math.minCredits).toBe(6)
      expect(math.requiredCourses).toEqual(['MATH-1', 'MATH-2'])
      const mb = getBucket(set, 'major_basic')
      expect(mb.minCredits).toBe(6)
      expect(mb.requiredCourses).toEqual(['MATH-PROB-1'])
      expect(mb.choiceGroups?.[0]?.courses).toEqual(['MATH-PROB-2', 'MATH-LINEAR-1'])
      // 요람 전공기초 소계 7 = SW커리어세미나 1 + major_basic 6
      expect(getBucket(set, 'sw_seminar').minCredits + mb.minCredits).toBe(7)
    }
  })

  it('A-20 교양 개편 버킷: 영어 3 / 대학글쓰기 3 / 마중물 1 / 아주상상 3(택1) / 영역별 12', () => {
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      expect(getBucket(set, 'english').requiredCourses).toEqual(['GE-ENGLISH'])
      expect(getBucket(set, 'english').minCredits).toBe(3)
      expect(getBucket(set, 'writing').requiredCourses).toEqual(['GE-WRITING'])
      expect(getBucket(set, 'ajou_character').requiredCourses).toEqual(['GE-AJOU-IN-PRIMER'])
      const ss = getBucket(set, 'ajou_sangsang')
      expect(ss.minCredits).toBe(3)
      expect(ss.choiceGroups?.[0]?.pick).toBe(1)
      expect(ss.choiceGroups?.[0]?.courses).toHaveLength(4)
      const al = getBucket(set, 'area_liberal')
      expect(al.minCredits).toBe(12)
      expect(al.minDistinctAreas).toBe(4)
      // 2025는 ai_literacy 버킷이 없다(2026 신설)
      expect(set.buckets.map((b) => b.id)).not.toContain('ai_literacy')
    }
  })

  it('A-21 전공 역량 인증이 check 타입(2024 count 2회에서 변경)', () => {
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      const r = set.nonCurricular.find((n) => n.id === 'major_ability')!
      expect(r.type).toBe('check')
      expect(r.min).toBeUndefined()
    }
  })

  it('A-22 영어 인증: 요람 9종 + 규칙 별표1의 NEW TEPS·IELTS, TOEIC Speaking은 신 스케일 IM1', () => {
    for (const set of [reqSet2025SwAdvanced, reqSet2025SwGeneral]) {
      const alts = set.nonCurricular.find((n) => n.id === 'english_cert')?.alternatives ?? []
      const byId = Object.fromEntries(alts.map((a) => [a.id, a]))
      expect(byId['toeic']?.min).toBe(730)
      expect(byId['teps']?.min).toBe(605)
      expect(byId['new_teps']?.min).toBe(329)
      expect(byId['ielts']?.min).toBe(5.5)
      expect(byId['toeic_sp']?.min).toBe('IM1')
      expect(byId['toeic_sp']?.scale).toContain('IM1')
      expect(byId['opic']?.min).toBe('IL')
    }
  })

  it('A-23 카탈로그 학점 합이 요람 인쇄 소계와 일치(전필 32 / 전선 172)', () => {
    const sum = (bucket: string) =>
      catalog2025Sw.filter((e) => e.defaultBucket === bucket).reduce((s, e) => s + e.credits, 0)
    expect(sum('major_required')).toBe(32)
    expect(sum('major_elective')).toBe(172)
  })

  it('A-24 creditBreakdown 합 === credits, 3열 합계가 요람 소계(이론98/설계28.5/실습45.5)', () => {
    const t = { theory: 0, design: 0, lab: 0 }
    for (const e of catalog2025Sw) {
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
    expect(t).toEqual({ theory: 98, design: 28.5, lab: 45.5 })
  })
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

function commonRequired2025(): Course[] {
  return [
    // mk의 기본 학점은 엔진 픽스처 카탈로그 기준이라, 1학점 과목은 명시한다.
    mk('GE-AJOU-IN-PRIMER', { credits: 1 }),
    mk('GE-ENGLISH', { credits: 3 }),
    mk('GE-WRITING', { credits: 3 }),
    mk('GE-AJOU-SANGSANG-HEALTH', { credits: 3 }),
    ...AREA_QUAD_2025.map((k) => mk(k, { credits: 3 })),
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
    mk('SW-AI-INTRO', { credits: 3 }),
    mk('SW-OOP', { credits: 4 }),
    mk('SW-DATA-STRUCT', { credits: 3 }),
    mk('SW-COMP-ARCH', { credits: 3 }),
    mk('SW-ALGORITHM', { credits: 3 }),
    mk('SW-SYS-PROGRAMMING', { credits: 3 }),
    mk('SW-NETWORK', { credits: 3 }),
    mk('SW-OS', { credits: 3 }),
  ]
}

/** 대학필수 22 + 전공기초 7 + BSM 13 + 전공필수 32 = 74 */
const COMMON_CREDITS_2025 = 74

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

/** 2025 심화 인증 4종 충족 상태. major_ability는 check라 done 플래그. */
function advancedNonCurricular2025(): NonCurricularState {
  return {
    english_cert: { alternatives: { opic: { level: 'IL' } } },
    major_ability: { done: true },
    programming_cert: { alternatives: { topcit: { score: 190 } } },
  }
}
function generalNonCurricular2025(): NonCurricularState {
  return { english_cert: { alternatives: { opic: { level: 'IL' } } } }
}

const advProfile2025 = () =>
  advancedProfile({
    admissionYear: 2025,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2025SwAdvanced.id,
  })
const genProfile2025 = (over = {}) =>
  generalProfile({
    admissionYear: 2025,
    college: '소프트웨어융합대학',
    requirementSetId: reqSet2025SwGeneral.id,
    ...over,
  })

describe('B. 심화 대표 성적표 (2025 SW)', () => {
  // 전공선택 33 = 캡스톤6 + 자기주도프로젝트3 + 3학점×8. 전공선택 과목이 3·6·1학점뿐이라
  // 32를 정확히 맞출 수 없어 33으로 채운다(최소 요건이므로 충족).
  function baseCourses(): Course[] {
    return [
      ...commonRequired2025(),
      mk('SW-CAPSTONE', { credits: 6 }),
      mk('SW-SELF-PROJECT', { credits: 3 }),
      ...ADV_ELECTIVES_3.map((k) => advElective(k)),
      ...Array.from({ length: 7 }, (_, i) => filler(`교양${i + 1}`)),
      filler('교양-1학점', 1),
    ]
  }
  const base = {
    profile: advProfile2025(),
    requirementSet: reqSet2025SwAdvanced,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2025Sw,
    nonCurricularState: advancedNonCurricular2025(),
  }

  it('B-01 완성 성적표 → 졸업 가능, 전 영역 충족, blocker 0', () => {
    const r = evaluate({ ...base, courses: baseCourses() })
    expect(r.credits.earned).toBe(COMMON_CREDITS_2025 + 33 + 22)
    expect(r.credits.earned).toBeGreaterThanOrEqual(128)
    for (const b of r.buckets) expect(b.satisfied, b.id).toBe(true)
    expect(r.majorPolicy.required).toBe(false)
    expect(r.blockers).toHaveLength(0)
    expect(r.verdict).toBe('graduatable')
  })

  it('B-02 아주상상프로젝트 누락 → 졸업 불가 + 해당 영역 blocker', () => {
    const courses = baseCourses().filter((c) => c.courseKey !== 'GE-AJOU-SANGSANG-HEALTH')
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('not_graduatable')
    expect(r.buckets.find((b) => b.id === 'ajou_sangsang')?.satisfied).toBe(false)
  })

  it('B-03 연결과 통합 영역 누락 → 영역별교양 미충족(2025 신설 영역)', () => {
    const courses = baseCourses().filter(
      (c) => c.courseKey !== 'GE-CI-ETHICS-OF-SCIENCE-AND-TECHNOLOGY'
    )
    const r = evaluate({ ...base, courses })
    expect(r.buckets.find((b) => b.id === 'area_liberal')?.satisfied).toBe(false)
    expect(r.verdict).toBe('not_graduatable')
  })

  it('B-04 마지막 전공선택 과목 수강중 → 이번 학기 완료 예정', () => {
    const courses = [
      ...baseCourses().filter((c) => c.courseKey !== 'SW-CG'),
      filler('교양-보충', 3),
      advElective('SW-CG', { state: 'enrolled' }),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable_after_current')
  })

  it('B-05 현장실습 6학점 상한 — 초과분은 일반선택으로 이월', () => {
    const courses = [
      ...commonRequired2025(),
      mk('SW-CAPSTONE', { credits: 6 }),
      mk('SW-SELF-PROJECT', { credits: 3 }),
      ...ADV_ELECTIVES_3.map((k) => advElective(k)),
      // 현장실습 4과목 12학점 → 6학점만 전공선택, 6학점은 일반선택
      mk('SW-FIELD-1', { credits: 3 }),
      mk('SW-FIELD-2', { credits: 3 }),
      mk('SW-FIELD-3', { credits: 3 }),
      mk('SW-FIELD-4', { credits: 3 }),
    ]
    const r = evaluate({ ...base, courses })
    const me = r.buckets.find((b) => b.id === 'major_elective')!
    const ge = r.buckets.find((b) => b.id === 'general_elective')!
    // 전공선택 = 캡스톤6 + 자기주도3 + 3×8 + 현장실습 6 = 39
    expect(me.earned).toBe(39)
    expect(ge.earned).toBe(6)
  })
})

describe('B. 일반 대표 성적표 (2025 SW)', () => {
  const genCommon: Course[] = [
    ...commonRequired2025(),
    advElective('SW-DB'),
    advElective('SW-SW-ENG'),
    advElective('SW-AI'),
    advElective('SW-CV'),
    ...Array.from({ length: 14 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-1학점', 2),
  ]
  const base = {
    profile: genProfile2025({ additionalMajors: [{ ruleId: 'am_minor', active: true }] }),
    requirementSet: reqSet2025SwGeneral,
    catalog: mergedCatalog,
    additionalMajorRules: additionalMajorRules2025Sw,
    nonCurricularState: generalNonCurricular2025(),
  }

  it('B-06 부전공 21학점 완성 → 졸업 가능 + 전공이수원칙 충족', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    expect(r.credits.earned).toBeGreaterThanOrEqual(128)
    expect(r.majorPolicy.required).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.additionalMajors.find((m) => m.id === 'am_minor')?.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('B-07 일반과정은 인증 3종 비활성(영어만 적용)', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    for (const id of ['major_ability', 'industry_project', 'programming_cert']) {
      expect(r.nonCurricular.find((n) => n.id === id)?.active, id).toBe(false)
    }
    expect(r.nonCurricular.find((n) => n.id === 'english_cert')?.active).toBe(true)
  })

  it('B-08 부전공 18학점(미완성) → 졸업 불가(전공 이수원칙 미충족)', () => {
    const courses = [
      ...genCommon,
      ...Array.from({ length: 6 }, (_, i) => minorCourse(i + 1)),
      filler('교양-추가', 3),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.credits.earned).toBeGreaterThanOrEqual(128)
    expect(r.verdict).toBe('not_graduatable')
    expect(r.majorPolicy.satisfied).toBe(false)
    expect(r.blockers.some((b) => b.category === 'major_policy')).toBe(true)
  })
})
