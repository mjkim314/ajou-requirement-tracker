/**
 * 2단계 번들 데이터(2021 SW) 검증.
 *
 * (A) 참조 무결성 — src/data JSON이 엔진 규칙을 만족하는지(런타임 가드. 컴파일
 *     타입체크는 resolveJsonModule 넓힘 때문에 무결성을 보장하지 못한다).
 * (B) 심화·일반 대표 성적표로 evaluate() 3-verdict 전이 확인.
 *
 * 기존 acceptance.test.ts(68건)와 독립. 픽스처가 아니라 정식 data/*.json을 로드한다.
 */

import { describe, it, expect } from 'vitest'
import { evaluate, buildCatalogIndex, normalizeText } from '../index.js'
import type { Bucket, Course, CourseState, RequirementSet } from '../types.js'
import {
  catalog2021Sw,
  reqSet2021SwAdvanced,
  reqSet2021SwGeneral,
  additionalMajorRules2021Sw,
} from '../../data/index.js'
import {
  mk,
  commonRequired,
  advancedProfile,
  generalProfile,
  advancedNonCurricular,
  generalNonCurricular,
} from './fixtures/builders.js'

const SETS: [string, RequirementSet][] = [
  ['advanced', reqSet2021SwAdvanced],
  ['general', reqSet2021SwGeneral],
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

const catalogKeys = new Set(catalog2021Sw.map((e) => e.courseKey))
const index = buildCatalogIndex(catalog2021Sw)

function getBucket(set: RequirementSet, id: string): Bucket {
  const b = set.buckets.find((x) => x.id === id)
  if (!b) throw new Error(`bucket ${id} 없음`)
  return b
}

// ────────────────────────────────────────────────────────────
// A. 참조 무결성
// ────────────────────────────────────────────────────────────

describe('A. 참조 무결성', () => {
  it('A-01 catalog courseKey 유일성', () => {
    expect(catalogKeys.size).toBe(catalog2021Sw.length)
  })

  describe.each(SETS)('세트=%s', (_name, set) => {
    it('A-02 requiredCourses[] 키가 모두 카탈로그에 존재', () => {
      for (const b of set.buckets) {
        for (const key of b.requiredCourses ?? []) {
          expect(catalogKeys, `${b.id}.requiredCourses ${key}`).toContain(key)
        }
      }
    })

    it('A-03 choiceGroups[].courses[] 키가 모두 카탈로그에 존재', () => {
      for (const b of set.buckets) {
        for (const g of b.choiceGroups ?? []) {
          for (const key of g.courses) {
            expect(catalogKeys, `${g.id} ${key}`).toContain(key)
          }
        }
      }
    })

    it('A-04 choiceGroups[].linkedTo가 같은 bucket 내 그룹 id를 가리킴', () => {
      for (const b of set.buckets) {
        const ids = new Set((b.choiceGroups ?? []).map((g) => g.id))
        for (const g of b.choiceGroups ?? []) {
          if (g.linkedTo != null) expect(ids).toContain(g.linkedTo)
        }
      }
    })

    it('A-05 카탈로그 area 값이 area_liberal.areas id 집합에 포함', () => {
      const areaIds = new Set((getBucket(set, 'area_liberal').areas ?? []).map((a) => a.id))
      for (const e of catalog2021Sw) {
        if (e.area != null) expect(areaIds, `${e.courseKey} area ${e.area}`).toContain(e.area)
      }
    })

    it('A-06 카탈로그 defaultBucket이 모두 유효 bucket id', () => {
      const bucketIds = new Set(set.buckets.map((b) => b.id))
      for (const e of catalog2021Sw) {
        expect(bucketIds, `${e.courseKey} defaultBucket ${e.defaultBucket}`).toContain(
          e.defaultBucket
        )
      }
    })

    it("A-07 group:'free' bucket이 정확히 1개", () => {
      const free = set.buckets.filter((b) => b.group === 'free')
      expect(free).toHaveLength(1)
    })

    it('A-08 industry_project field 그룹 === 카탈로그 field 태그 집합', () => {
      const catalogField = catalog2021Sw
        .filter((e) => (e.courseGroups ?? []).includes('field'))
        .map((e) => e.courseKey)
        .sort()
      const ip = set.nonCurricular.find((r) => r.id === 'industry_project')
      const fieldGroup = ip?.groups?.find((g) => g.id === 'field')?.courses ?? []
      expect([...fieldGroup].sort()).toEqual(catalogField)
      // 모든 그룹 과목이 카탈로그에 존재
      for (const g of ip?.groups ?? []) {
        for (const key of g.courses) expect(catalogKeys, `${g.id} ${key}`).toContain(key)
      }
    })

    it('A-09 courseGroups(field_practice) 키 존재 + capBucket/overflowTo 유효', () => {
      const bucketIds = new Set(set.buckets.map((b) => b.id))
      for (const cg of set.courseGroups ?? []) {
        for (const key of cg.courses) expect(catalogKeys, `${cg.id} ${key}`).toContain(key)
        if (cg.capBucket != null) expect(bucketIds).toContain(cg.capBucket)
        if (cg.overflowTo != null) expect(bucketIds).toContain(cg.overflowTo)
      }
    })

    it('A-11 equivalents: to는 카탈로그에 존재, from 미존재는 의도된 집합만', () => {
      const danglingFrom: string[] = []
      for (const eq of set.equivalents ?? []) {
        expect(catalogKeys, `equivalent ${eq.id} to ${eq.to}`).toContain(eq.to)
        if (!catalogKeys.has(eq.from)) danglingFrom.push(eq.from)
      }
      // ICT 교차 과목은 완결형 SW 카탈로그 밖이라 의도적으로 미발동
      expect(danglingFrom.sort()).toEqual(['ICT-DATA-STRUCT', 'ICT-OSS-INTRO'])
    })

    it('A-13 gradePoints 9키 존재, A+ === 4.5', () => {
      const gp = set.gradePoints ?? {}
      for (const g of ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F'] as const) {
        expect(gp[g], `gradePoint ${g}`).toBeTypeOf('number')
      }
      expect(gp['A+']).toBe(4.5)
    })

    it('A-14 totalCredits 140 / minGPA 2.0', () => {
      expect(set.totalCredits).toBe(140)
      expect(set.minGPA).toBe(2.0)
    })

    it('A-15 bucket minCredits 합 ≤ totalCredits', () => {
      const sum = set.buckets.reduce((s, b) => s + b.minCredits, 0)
      expect(sum).toBeLessThanOrEqual(set.totalCredits)
    })
  })

  it('A-06b 두 세트의 bucket id 집합이 동일', () => {
    const a = new Set(reqSet2021SwAdvanced.buckets.map((b) => b.id))
    const g = reqSet2021SwGeneral.buckets.map((b) => b.id)
    expect(g).toHaveLength(a.size)
    for (const id of g) expect(a).toContain(id)
  })

  it('A-14b major_elective만 minCredits가 다르고(37/10) 나머지는 동일', () => {
    for (const b of reqSet2021SwAdvanced.buckets) {
      const gb = getBucket(reqSet2021SwGeneral, b.id)
      if (b.id === 'major_elective') {
        expect(b.minCredits).toBe(37)
        expect(gb.minCredits).toBe(10)
      } else {
        expect(gb.minCredits, `${b.id}`).toBe(b.minCredits)
      }
    }
  })

  it('A-10 추가전공 규칙: type 유효 + homeOverlapCap 숫자 + requiredCourses 키 존재', () => {
    for (const r of additionalMajorRules2021Sw) {
      expect(AM_TYPES, `${r.id} type`).toContain(r.type)
      expect(r.homeOverlapCap).toBeTypeOf('number')
      for (const key of r.requiredCourses ?? []) expect(catalogKeys).toContain(key)
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
})

// ────────────────────────────────────────────────────────────
// B. 판정 전이 (verdict)
// ────────────────────────────────────────────────────────────

const ADV_ELECTIVES = [
  'SW-DB', 'SW-SW-ENG', 'SW-AI', 'SW-CV', 'SW-ML',
  'SW-COMPILER', 'SW-OSS-INTRO', 'SW-DISTRIBUTED', 'SW-CG', 'SW-DATA-MINING',
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

describe('B. 심화 대표 성적표', () => {
  // 전공선택 37 = 캡스톤3 + 자기주도3 + 3학점 전선 10과목(30) + 산업세미나1
  // 일반선택 28 = 3학점 9 + 1학점 1
  const courses: Course[] = [
    ...commonRequired(),
    mk('SW-CAPSTONE'),
    mk('SW-SELF-PROJECT'),
    ...ADV_ELECTIVES.map((k) => mk(k)),
    mk('SW-IND-SEMINAR'),
    ...Array.from({ length: 9 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-1학점', 1),
  ]
  const result = evaluate({
    profile: advancedProfile(),
    courses,
    requirementSet: reqSet2021SwAdvanced,
    catalog: catalog2021Sw,
    additionalMajorRules: additionalMajorRules2021Sw,
    nonCurricularState: advancedNonCurricular(),
  })

  it('B-01 졸업 가능', () => {
    expect(result.verdict).toBe('graduatable')
  })
  it('B-02 총 이수학점 140', () => {
    expect(result.credits.earned).toBe(140)
  })
  it('B-03 전 영역 충족', () => {
    for (const b of result.buckets) expect(b.satisfied, b.id).toBe(true)
  })
  it('B-04 심화는 추가전공 불필요', () => {
    expect(result.majorPolicy.required).toBe(false)
  })
  it('B-05 평점 4.0 · blocker 없음', () => {
    expect(result.gpa.overall).toBeCloseTo(4.0, 5)
    expect(result.blockers).toHaveLength(0)
  })
})

describe('B. 일반 대표 성적표', () => {
  // 필수(75) + 전공선택 10(SW-DB,SW-SW-ENG,SW-AI,SW산업세미나) + 교양 34
  const genCommon: Course[] = [
    ...commonRequired(),
    mk('SW-DB'),
    mk('SW-SW-ENG'),
    mk('SW-AI'),
    mk('SW-IND-SEMINAR'),
    ...Array.from({ length: 11 }, (_, i) => filler(`교양${i + 1}`)),
    filler('교양-1학점', 1),
  ]
  const profile = generalProfile({
    additionalMajors: [{ ruleId: 'am_minor', active: true }],
  })
  const base = {
    profile,
    requirementSet: reqSet2021SwGeneral,
    catalog: catalog2021Sw,
    additionalMajorRules: additionalMajorRules2021Sw,
    nonCurricularState: generalNonCurricular(),
  }

  it('B-06 부전공 21학점 완성 → 졸업 가능', () => {
    const courses = [...genCommon, ...Array.from({ length: 7 }, (_, i) => minorCourse(i + 1))]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable')
    expect(r.credits.earned).toBe(140)
    expect(r.majorPolicy.required).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.additionalMajors.find((m) => m.id === 'am_minor')?.satisfied).toBe(true)
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
    // 총학점은 140 유지, 부전공만 6과목 → majorPolicy만 실패시킴
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

  it('B-09 부전공 마지막 과목 수강중 → 이번 학기 완료 예정', () => {
    const courses = [
      ...genCommon,
      ...Array.from({ length: 6 }, (_, i) => minorCourse(i + 1)),
      minorCourse(7, 'enrolled'),
    ]
    const r = evaluate({ ...base, courses })
    expect(r.verdict).toBe('graduatable_after_current')
  })
})
