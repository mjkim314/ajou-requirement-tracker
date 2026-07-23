/**
 * 설계명세서 v0.2 10장 Acceptance Test.
 *
 * 계산 엔진(Requirement Engine + Progress Calculator)을 UI 없이 검증한다.
 * 각 카테고리 A~L을 명세서 표 순서대로 옮겼다.
 */

import { describe, expect, it } from 'vitest'
import { evaluate } from '../evaluate.js'
import { analyzeEquivalents, computeEffectiveKeys } from '../resolve.js'
import { subsetSumMax } from '../check.js'
import type { CatalogEntry, EvaluationInput, Grade, RequirementSet } from '../types.js'
import { CATALOG } from './fixtures/catalog.js'
import {
  ADVANCED_SET,
  AM_DOUBLE,
  AM_MINOR,
  AM_NONSAT,
  GENERAL_SET,
} from './fixtures/reqsets.js'
import {
  advancedNonCurricular,
  advancedProfile,
  baseAdvanced,
  baseAdvancedCourses,
  baseGeneral,
  commonRequired,
  fill,
  mk,
} from './fixtures/builders.js'

// 심화 최소 입력 헬퍼(비교과·부가 축을 신경 쓰지 않고 특정 축만 볼 때)
function advEval(courses: EvaluationInput['courses'], over: Partial<EvaluationInput> = {}) {
  return evaluate({
    profile: advancedProfile(),
    courses,
    requirementSet: ADVANCED_SET,
    catalog: CATALOG,
    nonCurricularState: {},
    additionalMajorRules: [],
    ...over,
  })
}

function bucket(r: ReturnType<typeof evaluate>, id: string) {
  return r.buckets.find((b) => b.id === id)!
}
function resolvedOf(r: ReturnType<typeof evaluate>, courseKeyOrId: string) {
  return r.resolved.find(
    (rc) => rc.courseKey === courseKeyOrId || rc.course.id === courseKeyOrId
  )!
}
function hasBlocker(r: ReturnType<typeof evaluate>, shortText: string) {
  return r.blockers.some((b) => b.shortText === shortText)
}

// ────────────────────────────────────────────────────────────
describe('A — 총 이수학점', () => {
  it('A-01 140학점·평점·전필·인증 완료 → graduatable', () => {
    const r = evaluate(baseAdvanced())
    expect(r.verdict).toBe('graduatable')
    expect(r.credits.earned).toBe(140)
  })

  it('A-02 139학점 → not_graduatable / "1학점 부족"', () => {
    const b = baseAdvanced()
    b.courses = b.courses.filter((c) => c.courseKey !== 'GE-FILL-1') // 1학점 제거
    const r = evaluate(b)
    expect(r.verdict).toBe('not_graduatable')
    expect(hasBlocker(r, '1학점 부족')).toBe(true)
  })

  it('A-03 145학점이나 전공선택 30 → "전공선택 7학점 부족"', () => {
    const courses = [
      ...commonRequired(),
      mk('SW-CAPSTONE'),
      mk('SW-SELF-PROJECT'),
      ...fill('SW-EFILL', 8), // 전공선택 3+3+24 = 30
      ...fill('GE-FILL', 13),
      mk('GE-FILL-1'), // 일반선택 40 → 총 145
    ]
    const r = evaluate({ ...baseAdvanced(), courses })
    expect(r.credits.earned).toBe(145)
    expect(r.verdict).toBe('not_graduatable')
    expect(hasBlocker(r, '전공선택 7학점 부족')).toBe(true)
  })

  it('A-04 총 140 정확히 → graduatable (경계값)', () => {
    const r = evaluate(baseAdvanced())
    expect(r.credits.earned).toBe(140)
    expect(r.verdict).toBe('graduatable')
  })
})

// ────────────────────────────────────────────────────────────
describe('B — 영역 및 필수 과목', () => {
  it('B-01 전공필수 10과목·운영체제 미이수 → "전필 1과목 부족"', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().filter((c) => c.courseKey !== 'SW-OS')
    const r = evaluate(b)
    expect(r.verdict).toBe('not_graduatable')
    expect(hasBlocker(r, '전필 1과목 부족')).toBe(true)
    expect(bucket(r, 'major_required').missingCourses).toContain('운영체제')
  })

  it('B-02 영역별교양 9학점이나 전부 역사와 철학 → minDistinctAreas 미충족', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => !['GE-AREA-ART', 'GE-AREA-SOC'].includes(c.courseKey!))
      .concat([mk('GE-AREA-HIST-2'), mk('GE-AREA-HIST-3')])
    const r = evaluate(b)
    const area = bucket(r, 'area_liberal')
    expect(area.earned).toBe(9)
    expect(area.satisfied).toBe(false)
    expect(area.reasons.join(' ')).toContain('영역')
    expect(r.verdict).toBe('not_graduatable')
  })

  it('B-03 영역별교양 3영역 각 1과목 → 충족', () => {
    const r = evaluate(baseAdvanced())
    expect(bucket(r, 'area_liberal').satisfied).toBe(true)
  })

  it('B-04 전공필수 11과목·36학점 → 충족', () => {
    const r = evaluate(baseAdvanced())
    const mr = bucket(r, 'major_required')
    expect(mr.satisfied).toBe(true)
    expect(mr.earned).toBe(36)
  })
})

// ────────────────────────────────────────────────────────────
describe('C — 평점', () => {
  it('C-01 누계 평점 미달(1.5) → "평점 미달"', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().map((c) => ({ ...c, grade: 'D+' as const }))
    const r = evaluate(b)
    expect(r.gpa.satisfied).toBe(false)
    expect(hasBlocker(r, '평점 미달')).toBe(true)
    expect(r.verdict).toBe('not_graduatable')
  })

  it('C-02 누계 평점 2.00 정확히 → 충족 (경계값)', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().map((c) => ({ ...c, grade: 'C0' as const }))
    const r = evaluate(b)
    expect(r.gpa.overall).toBe(2.0)
    expect(r.gpa.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('C-03 전체 충족·전공 평점 미달 → 전체 기준으로 판정, 전공은 표시만', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().map((c) => {
      const e = CATALOG.find((x) => x.courseKey === c.courseKey)
      const isMajor = e?.defaultBucket === 'major_required' || e?.defaultBucket === 'major_elective'
      return { ...c, grade: (isMajor ? 'D+' : 'A+') as Grade }
    })
    const r = evaluate(b)
    expect(r.gpa.satisfied).toBe(true) // 전체 기준 충족
    expect(r.gpa.major).toBeLessThan(2.0) // 전공 평점은 표시만
  })
})

// ────────────────────────────────────────────────────────────
describe('D — 비교과 요건', () => {
  it('D-01 심화·TOPCIT 185 → "프로그래밍 역량 인증 미완료"', () => {
    const b = baseAdvanced()
    b.nonCurricularState = { ...advancedNonCurricular(), programming_cert: { alternatives: { topcit: { score: 185 } } } }
    const r = evaluate(b)
    expect(r.verdict).toBe('not_graduatable')
    expect(hasBlocker(r, '프로그래밍 역량 인증 미완료')).toBe(true)
  })

  it('D-02 심화·TOPCIT 185 + 자체 경시대회 완료 → 충족 (alternatives)', () => {
    const b = baseAdvanced()
    b.nonCurricularState = {
      ...advancedNonCurricular(),
      programming_cert: { alternatives: { topcit: { score: 185 }, contest: { done: true } } },
    }
    const r = evaluate(b)
    expect(r.nonCurricular.find((x) => x.id === 'programming_cert')!.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('D-03 일반과정·TOPCIT 미응시 → 요건 비활성 → graduatable', () => {
    const b = baseGeneral({
      minorTag: 'am_minor',
      minorCredits: 21,
      profile: { additionalMajors: [{ ruleId: 'am_minor', active: true }] },
    })
    b.additionalMajorRules = [AM_MINOR]
    const r = evaluate(b)
    const prog = r.nonCurricular.find((x) => x.id === 'programming_cert')!
    expect(prog.active).toBe(false)
    expect(r.verdict).toBe('graduatable')
  })

  it('D-04 OPIc IL 보유 → 영어 인증 충족', () => {
    const r = evaluate(baseAdvanced())
    expect(r.nonCurricular.find((x) => x.id === 'english_cert')!.satisfied).toBe(true)
  })

  it('D-05 OPIc NH 보유 → 영어 인증 미충족 (scale 인덱스)', () => {
    const b = baseAdvanced()
    b.nonCurricularState = { ...advancedNonCurricular(), english_cert: { alternatives: { opic: { level: 'NH' } } } }
    const r = evaluate(b)
    expect(r.nonCurricular.find((x) => x.id === 'english_cert')!.satisfied).toBe(false)
    expect(hasBlocker(r, '영어 인증 미완료')).toBe(true)
  })

  it('D-06 산학프로젝트 과목군 1개만 → 미충족 (pick 2)', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'SW-SELF-PROJECT')
      .concat(mk('SW-EFILL')) // 전공선택 학점 유지
    const r = evaluate(b)
    expect(r.nonCurricular.find((x) => x.id === 'industry_project')!.satisfied).toBe(false)
  })

  it('D-07 IT집중교육1+2만 → 미충족 (같은 과목군 = 1개)', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => !['SW-CAPSTONE', 'SW-SELF-PROJECT'].includes(c.courseKey!))
      .concat([mk('SW-IT-INTENSIVE-1'), mk('SW-IT-INTENSIVE-2')])
    const r = evaluate(b)
    expect(r.nonCurricular.find((x) => x.id === 'industry_project')!.satisfied).toBe(false)
  })

  it('D-08 IT집중교육1 + SW캡스톤디자인 → 충족 (서로 다른 2개 군)', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'SW-SELF-PROJECT')
      .concat(mk('SW-IT-INTENSIVE-1'))
    const r = evaluate(b)
    expect(r.nonCurricular.find((x) => x.id === 'industry_project')!.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })
})

// ────────────────────────────────────────────────────────────
describe('E — 전공 이수원칙', () => {
  it('E-01 일반과정·추가전공 0건 → "복수/부전공 미이수"', () => {
    const r = evaluate(baseGeneral())
    expect(r.majorPolicy.satisfied).toBe(false)
    expect(hasBlocker(r, '복수/부전공 미이수')).toBe(true)
    expect(r.verdict).toBe('not_graduatable')
  })

  it('E-02 일반과정·부전공 완료 → 충족', () => {
    const b = baseGeneral({
      minorTag: 'am_minor',
      minorCredits: 21,
      profile: { additionalMajors: [{ ruleId: 'am_minor', active: true }] },
    })
    b.additionalMajorRules = [AM_MINOR]
    const r = evaluate(b)
    expect(r.additionalMajors[0]!.satisfied).toBe(true)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('E-03 일반과정·추가전공 0건 + 학·석사연계 예외 → 충족', () => {
    const b = baseGeneral({ profile: { exemptions: ['linked_masters'], additionalMajors: [] } })
    const r = evaluate(b)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('E-04 심화과정·추가전공 0건 → 충족', () => {
    const r = evaluate(baseAdvanced())
    expect(r.majorPolicy.required).toBe(false)
    expect(r.majorPolicy.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('E-05 일반과정·satisfiesMajorPolicy=false 전공만 완료 → 미충족', () => {
    const b = baseGeneral({
      minorTag: 'am_nonsat',
      minorCredits: 21,
      profile: { additionalMajors: [{ ruleId: 'am_nonsat', active: true }] },
    })
    b.additionalMajorRules = [AM_NONSAT]
    const r = evaluate(b)
    expect(r.additionalMajors[0]!.satisfied).toBe(true) // 전공 자체는 완료
    expect(r.majorPolicy.satisfied).toBe(false) // 그러나 정책은 미충족
    expect(r.verdict).toBe('not_graduatable')
  })
})

// ────────────────────────────────────────────────────────────
describe('F — 택1 그룹', () => {
  it('F-01 수학1·2·확통1 + 선형대수1 → 수학 충족', () => {
    const r = evaluate(baseAdvanced())
    expect(bucket(r, 'math').satisfied).toBe(true)
  })

  it('F-02 수학1·2·확통1 + 확통2 → 수학 충족', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'MATH-LINEAR-1')
      .concat(mk('MATH-PROB-2'))
    const r = evaluate(b)
    expect(bucket(r, 'math').satisfied).toBe(true)
  })

  it('F-03 수학1·2·확통1만 → 택1 그룹 미이수', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().filter((c) => c.courseKey !== 'MATH-LINEAR-1')
    const r = evaluate(b)
    const m = bucket(r, 'math')
    expect(m.satisfied).toBe(false)
    expect(m.reasons.join(' ')).toContain('택1')
  })

  it('F-04 물리학 + 생명과학실험 + 화학 → linkedTo 정합 경고', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'SCI-PHYSICS-LAB')
      .concat(mk('SCI-BIOLOGY-LAB'))
    const r = evaluate(b)
    expect(r.warnings.some((w) => w.shortText === '실험 짝 불일치')).toBe(true)
    // 명세 10.7 F-04는 '경고'(차단 아님) — linkedTo 불일치가 satisfied를 떨어뜨리지 않음을 고정.
    // (제품 톤: 겁주지 않고 참고용 경고. 학점·pick은 충족했으므로 satisfied는 유지)
    expect(bucket(r, 'science_basic').satisfied).toBe(true)
  })

  it('F-05 물리학 + 물리학실험 + 화학 → 기초과학 충족', () => {
    const r = evaluate(baseAdvanced())
    expect(bucket(r, 'science_basic').satisfied).toBe(true)
    expect(r.warnings.some((w) => w.shortText === '실험 짝 불일치')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────
describe('G — 인정 상한 및 이월', () => {
  it('G-01 SW현장실습 1~6 (18학점) → 전공선택 6 + 일반선택 12', () => {
    const courses = ['SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6'].map((k) => mk(k))
    const r = advEval(courses)
    expect(bucket(r, 'major_elective').earned).toBe(6)
    expect(bucket(r, 'general_elective').earned).toBe(12)
    expect(r.credits.earned).toBe(18)
  })

  it('G-02 SW현장실습 1~2 (6학점) → 전부 전공선택, 이월 없음', () => {
    const r = advEval([mk('SW-FIELD-1'), mk('SW-FIELD-2')])
    expect(bucket(r, 'major_elective').earned).toBe(6)
    expect(r.warnings.some((w) => w.detail.includes('이월'))).toBe(false)
  })

  it('G-03 전공선택 40학점 (37 필요) → 충족, 초과 3학점 총 학점 포함', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().concat(mk('SW-EFILL'))
    const r = evaluate(b)
    expect(bucket(r, 'major_elective').earned).toBe(40)
    expect(bucket(r, 'major_elective').satisfied).toBe(true)
    expect(r.credits.earned).toBe(143)
  })
})

// ────────────────────────────────────────────────────────────
describe('H — 다중 전공 중복 인정', () => {
  function withDouble(courses: EvaluationInput['courses'], rule = AM_DOUBLE) {
    return evaluate({
      profile: advancedProfile({ additionalMajors: [{ ruleId: rule.id, active: true }] }),
      courses,
      requirementSet: ADVANCED_SET,
      catalog: CATALOG,
      additionalMajorRules: [rule],
    })
  }

  it('H-01 복수전공·중복 12학점 (cap 6) → 6학점만 인정', () => {
    const r = withDouble(fill('OV-3A', 4, { countsToward: ['primary', 'am_hsda_double'] }))
    expect(r.additionalMajors[0]!.earned).toBe(6)
  })

  it('H-02 부전공·중복 4학점 (cap 3) → 3학점만 인정', () => {
    const courses = [
      mk('OV-3A', { countsToward: ['primary', 'am_minor'] }),
      mk('OV-1', { countsToward: ['primary', 'am_minor'] }),
    ]
    const r = withDouble(courses, AM_MINOR)
    expect(r.additionalMajors[0]!.earned).toBe(3)
  })

  it('H-03 복수전공·중복 4·3·3 (cap 6) → 3+3 = 6 인정 (부분합)', () => {
    const courses = [
      mk('OV-4', { countsToward: ['primary', 'am_hsda_double'] }),
      mk('OV-3A', { countsToward: ['primary', 'am_hsda_double'] }),
      mk('OV-3B', { countsToward: ['primary', 'am_hsda_double'] }),
    ]
    const r = withDouble(courses)
    expect(r.additionalMajors[0]!.earned).toBe(6)
  })

  it('H-04 countsToward=[double_major] 수동 지정 → 사용자 지정 우선', () => {
    const r = withDouble([mk('OV-4', { countsToward: ['double_major'] })])
    expect(r.additionalMajors[0]!.earned).toBe(4)
  })

  it('부분합 유틸: subsetSumMax([4,3,3], 6) === 6', () => {
    expect(subsetSumMax([4, 3, 3], 6)).toBe(6)
    expect(subsetSumMax([4], 6)).toBe(4)
  })
})

// ────────────────────────────────────────────────────────────
describe('I — 성적 및 재수강', () => {
  it('I-01 자료구조 F → 재수강 A0 → 이수 3, 평점 A0만', () => {
    const courses = [
      mk('SW-DATA-STRUCT', { grade: 'F', id: 'd1' }),
      mk('SW-DATA-STRUCT', { grade: 'A0', retakeOf: 'd1', id: 'd2' }),
    ]
    const r = advEval(courses)
    expect(r.credits.earned).toBe(3)
    expect(r.gpa.overall).toBe(4.0)
  })

  it('I-02 P 과목 3학점 → 이수 +3, 평점 제외', () => {
    const r = advEval([mk('SW-EFILL', { grade: 'P', isPassFail: true })])
    expect(r.credits.earned).toBe(3)
  })

  it('I-03 NP 과목 3학점 → 이수·평점 모두 제외', () => {
    const r = advEval([mk('SW-EFILL', { grade: 'NP' })])
    expect(r.credits.earned).toBe(0)
  })

  it('I-04 F 과목 3학점 (재수강 없음) → 이수 제외, 평점 포함', () => {
    const r = advEval([mk('SW-EFILL', { grade: 'A0' }), mk('SW-EFILL', { grade: 'F' })])
    expect(r.credits.earned).toBe(3) // A0만 학점
    expect(r.gpa.overall).toBe(2.0) // (4.0*3 + 0*3) / 6 — F가 평점에 반영
  })
})

// ────────────────────────────────────────────────────────────
describe('J — 과목 상태', () => {
  it('J-01 enrolled 12학점 → earned 제외, inProgress 12', () => {
    const r = advEval(fill('SW-EFILL', 4, { state: 'enrolled', grade: null }))
    expect(r.credits.earned).toBe(0)
    expect(r.credits.inProgress).toBe(12)
  })

  it('J-02 133학점 + enrolled 7, 그 외 충족 → graduatable_after_current', () => {
    const courses = [
      ...commonRequired(),
      mk('SW-CAPSTONE'),
      mk('SW-SELF-PROJECT'),
      ...fill('SW-EFILL', 10),
      mk('SW-EFILL-1'), // 전공선택 37
      ...fill('GE-FILL', 7), // 일반선택 완료 21
      ...fill('GE-FILL', 2, { state: 'enrolled', grade: null }), // 6 수강중
      mk('GE-FILL-1', { state: 'enrolled', grade: null }), // 1 수강중
    ]
    const b = baseAdvanced()
    const r = evaluate({ ...b, courses })
    expect(r.credits.earned).toBe(133)
    expect(r.credits.inProgress).toBe(7)
    expect(r.verdict).toBe('graduatable_after_current')
  })

  it('J-03 dropped 과목 → 모든 집계 제외', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses().concat(mk('SW-EFILL', { state: 'dropped', grade: null }))
    const r = evaluate(b)
    expect(r.credits.earned).toBe(140)
    expect(r.verdict).toBe('graduatable')
  })

  it('J-04 transferred 15학점 → 이수 포함, 평점 제외', () => {
    const r = advEval(fill('SW-EFILL', 5, { state: 'transferred', grade: null }))
    expect(r.credits.earned).toBe(15)
    expect(r.gpa.overall).toBe(0) // 평점 계산 대상 없음
  })

  it('J-05 planned 과목만 존재 → 이수 0, not_graduatable', () => {
    const r = advEval(fill('SW-EFILL', 4, { state: 'planned', grade: null }))
    expect(r.credits.earned).toBe(0)
    expect(r.verdict).toBe('not_graduatable')
  })
})

// ────────────────────────────────────────────────────────────
describe('K — 과목 식별 및 대체', () => {
  it('K-01 SCE202 입력 → SW-DATA-STRUCT로 정규화 (codes 매칭)', () => {
    const r = advEval([mk(null, { courseKey: null, nameSnapshot: 'SCE202' })])
    expect(r.resolved[0]!.courseKey).toBe('SW-DATA-STRUCT')
  })

  it('K-02 "해외인턴쉽1" 입력 → aliases 매칭', () => {
    const r = advEval([mk(null, { courseKey: null, nameSnapshot: '해외인턴쉽1' })])
    expect(r.resolved[0]!.courseKey).toBe('SW-INTERN-1')
  })

  it('K-03 SCE411 입력 → 후보 2건, 사용자 선택 요청', () => {
    const r = advEval([mk(null, { courseKey: null, nameSnapshot: 'SCE411' })])
    expect(r.resolved[0]!.courseKey).toBeNull()
    expect(r.diagnostics.ambiguous[0]!.candidates).toHaveLength(2)
    expect(r.diagnostics.ambiguous[0]!.candidates).toEqual(
      expect.arrayContaining(['SW-MODEL-SIM', 'SW-ADV-COMP-ARCH'])
    )
  })

  it('K-04 인공지능입문 이수 + 대체 규칙 → 창의소프트웨어입문 요건 충족', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'SW-CREATIVE-SW-INTRO')
      .concat(mk('SW-AI-INTRO'))
    const r = evaluate(b)
    const mr = bucket(r, 'major_required')
    expect(mr.missingCourses).not.toContain('창의소프트웨어입문')
    expect(mr.satisfied).toBe(true)
    expect(r.verdict).toBe('graduatable')
  })

  it('K-05 카탈로그에 없는 과목 → general_elective 귀속, 경고', () => {
    const r = advEval([mk(null, { courseKey: null, nameSnapshot: '양자컴퓨팅' })])
    const rc = r.resolved[0]!
    expect(rc.unmatched).toBe(true)
    expect(rc.bucketId).toBe('general_elective')
    expect(r.diagnostics.unmatched).toHaveLength(1)
  })

  it('K-06 대체 규칙 A→B, B→A 순환 → 검출 + 원본 유지', () => {
    const analysis = analyzeEquivalents(
      [
        { id: 'r1', type: 'replaces', from: 'CY-A', to: 'CY-B', direction: 'forward' },
        { id: 'r2', type: 'replaces', from: 'CY-B', to: 'CY-A', direction: 'forward' },
      ],
      2021
    )
    expect(analysis.cycleWarnings.length).toBeGreaterThan(0)
    expect(computeEffectiveKeys('CY-A', analysis).keys).toEqual(['CY-A'])
  })
})

// ────────────────────────────────────────────────────────────
describe('L — 귀속 우선순위', () => {
  const L_CATALOG: CatalogEntry[] = [
    { courseKey: 'LA', name: 'LA', credits: 6, defaultBucket: 'lfree', active: true },
    { courseKey: 'LZ', name: 'LZ', credits: 3, defaultBucket: 'lfree', active: true },
    { courseKey: 'LX', name: 'LX', credits: 3, defaultBucket: 'lfree', active: true },
  ]
  const L_SET: RequirementSet = {
    schemaVersion: 2,
    requirementVersion: 'l',
    id: 'l',
    name: 'L',
    trackType: 'advanced',
    totalCredits: 12,
    minGPA: 0,
    buckets: [
      { id: 'lb1', label: 'L1', group: 'major', minCredits: 6, requiredCourses: ['LA', 'LZ', 'LX'] },
      { id: 'lb2', label: 'L2', group: 'major', minCredits: 6, requiredCourses: ['LZ'] },
      { id: 'lfree', label: '자유', group: 'free', minCredits: 0 },
    ],
    nonCurricular: [],
  }
  function lEval(courses: EvaluationInput['courses']) {
    return evaluate({
      profile: advancedProfile({ requirementSetId: 'l' }),
      courses,
      requirementSet: L_SET,
      catalog: L_CATALOG,
    })
  }

  it('L-01 카탈로그 기본값 vs 사용자 지정 → 사용자 지정 우선', () => {
    const r = advEval([mk('SW-EFILL', { bucketOverride: 'general_elective' })])
    const rc = r.resolved[0]!
    expect(rc.bucketId).toBe('general_elective')
    expect(rc.resolutionPriority).toBe(1)
  })

  it('L-02 requiredCourses에 있고 카탈로그 기본값은 다름 → 요건 세트 우선', () => {
    const r = lEval([mk('LX', { credits: 3 })])
    const rc = resolvedOf(r, 'LX')
    expect(rc.bucketId).toBe('lb1')
    expect(rc.resolutionPriority).toBe(2)
  })

  it('L-03 두 영역 동시 지목, 한쪽만 minCredits 미달 → 미달 영역에 배정', () => {
    const r = lEval([mk('LA', { credits: 6 }), mk('LZ', { credits: 3 })])
    expect(resolvedOf(r, 'LZ').bucketId).toBe('lb2') // lb1은 LA로 충족 → 미달 lb2로
  })

  it('L-04 두 영역 동시 지목, 둘 다 미달 → 선언 순서 우선 (결정론)', () => {
    const r = lEval([mk('LZ', { credits: 3 })])
    expect(resolvedOf(r, 'LZ').bucketId).toBe('lb1') // 둘 다 미달 → 선언 순서 lb1
  })
})

// ────────────────────────────────────────────────────────────
describe('회귀 — 요건 세트 교체', () => {
  it('일반과정 세트로도 엔진 코드 수정 없이 판정된다 (A-01류)', () => {
    // 일반과정 + 부전공 완료 → graduatable
    const b = baseGeneral({
      minorTag: 'am_minor',
      minorCredits: 21,
      profile: { additionalMajors: [{ ruleId: 'am_minor', active: true }] },
    })
    b.additionalMajorRules = [AM_MINOR]
    const r = evaluate(b)
    expect(r.credits.earned).toBe(140)
    expect(r.verdict).toBe('graduatable')
  })

  it('결정론 — 동일 입력은 항상 동일 verdict', () => {
    const a = evaluate(baseAdvanced())
    const b = evaluate(baseAdvanced())
    expect(a.verdict).toBe(b.verdict)
    expect(a.credits.earned).toBe(b.credits.earned)
    expect(a.gpa.overall).toBe(b.gpa.overall)
  })
})

// ────────────────────────────────────────────────────────────
// 명세 대조 감사(spec-audit) 후속 — 놓쳤던 규칙·회귀 방지
// ────────────────────────────────────────────────────────────
describe('감사 후속 — 대체 규칙 effectiveFrom 게이팅', () => {
  it('admissionYear < effectiveFrom → 대체 미적용 (원본 키만)', () => {
    const eqs = [
      { id: 'e', type: 'replaces' as const, from: 'X', to: 'Y', direction: 'bidirectional' as const, effectiveFrom: 2023 },
    ]
    const a = analyzeEquivalents(eqs, 2021)
    expect(computeEffectiveKeys('Y', a).keys).toEqual(['Y']) // 게이팅됨
  })

  it('admissionYear >= effectiveFrom → 대체 적용 (요건 충족)', () => {
    const eqs = [
      { id: 'e', type: 'replaces' as const, from: 'X', to: 'Y', direction: 'bidirectional' as const, effectiveFrom: 2023 },
    ]
    const a = analyzeEquivalents(eqs, 2023)
    expect(computeEffectiveKeys('Y', a).keys).toEqual(expect.arrayContaining(['Y', 'X']))
  })
})

describe('감사 후속 — GPA는 반올림 전 값으로 판정 (#4)', () => {
  it('표시는 2.00으로 반올림돼도 실제 1.996이면 미충족', () => {
    const set: RequirementSet = {
      ...ADVANCED_SET,
      id: 'gpa_boundary',
      gradePoints: { ...ADVANCED_SET.gradePoints, C0: 1.996 },
    }
    const r = evaluate({
      profile: advancedProfile(),
      courses: [mk('SW-EFILL', { grade: 'C0' })],
      requirementSet: set,
      catalog: CATALOG,
    })
    expect(r.gpa.overall).toBe(2.0) // 표시용은 반올림
    expect(r.gpa.satisfied).toBe(false) // 판정은 미반올림(1.996 < 2.0)
  })
})

describe('감사 후속 — 추가전공 과목군·requiredCourses 판정 (7.4[10])', () => {
  const AM_RICH: import('../types.js').AdditionalMajorRule = {
    id: 'am_rich',
    name: '리치복수전공',
    type: 'double_major',
    typeLabel: '복수전공',
    totalMinCredits: 12,
    homeOverlapCap: 6,
    satisfiesMajorPolicy: true,
    requiredCourses: ['SW-OS'],
    courseGroups: [
      { id: 'field', label: '현장실습군', minCredits: 6 },
      { id: 'capstone', label: '캡스톤군', minCredits: 3 },
    ],
  }
  function richEval(courses: EvaluationInput['courses']) {
    return evaluate({
      profile: advancedProfile({ additionalMajors: [{ ruleId: 'am_rich', active: true }] }),
      courses,
      requirementSet: ADVANCED_SET,
      catalog: CATALOG,
      additionalMajorRules: [AM_RICH],
    })
  }

  it('총학점 충족이라도 과목군 최소학점 미달이면 미충족', () => {
    // total 12 충족, 그러나 현장실습군 3 < 6
    const r = richEval([
      mk('SW-FIELD-1', { countsToward: ['am_rich'] }), // field 3
      mk('SW-CAPSTONE', { countsToward: ['am_rich'] }), // capstone 3
      mk('SW-OS', { countsToward: ['am_rich'] }), // required
      mk('SW-EFILL', { countsToward: ['am_rich'] }), // 채움 3 → total 12
    ])
    const am = r.additionalMajors[0]!
    expect(am.earned).toBeGreaterThanOrEqual(12)
    expect(am.satisfied).toBe(false) // field 군 미달
  })

  it('requiredCourses 누락이면 미충족', () => {
    const r = richEval([
      mk('SW-FIELD-1', { countsToward: ['am_rich'] }),
      mk('SW-FIELD-2', { countsToward: ['am_rich'] }), // field 6 ✓
      mk('SW-CAPSTONE', { countsToward: ['am_rich'] }), // capstone 3 ✓
      mk('SW-EFILL', { countsToward: ['am_rich'] }), // total 15
      // SW-OS(required) 없음
    ])
    expect(r.additionalMajors[0]!.satisfied).toBe(false)
  })

  it('과목군·requiredCourses·총학점 모두 충족이면 완료', () => {
    const r = richEval([
      mk('SW-FIELD-1', { countsToward: ['am_rich'] }),
      mk('SW-FIELD-2', { countsToward: ['am_rich'] }), // field 6 ✓
      mk('SW-CAPSTONE', { countsToward: ['am_rich'] }), // capstone 3 ✓
      mk('SW-OS', { countsToward: ['am_rich'] }), // required ✓ → total 15
    ])
    expect(r.additionalMajors[0]!.satisfied).toBe(true)
  })
})

describe('감사 후속 — minDistinctAreas는 귀속 영역만 집계 (#2 회귀)', () => {
  it('area 과목을 override로 다른 영역에 빼면 그 영역은 충족으로 세지 않는다', () => {
    const b = baseAdvanced()
    b.courses = baseAdvancedCourses()
      .filter((c) => c.courseKey !== 'GE-AREA-ART') // lit_art 원본 제거
      .concat(mk('GE-AREA-HIST-2')) // 영역별교양 학점 9 유지
      .concat(mk('GE-AREA-ART', { bucketOverride: 'general_elective' })) // lit_art를 일반선택으로 뺌
    const r = evaluate(b)
    const area = bucket(r, 'area_liberal')
    expect(area.earned).toBe(9) // 학점은 충족
    // hist_phil 2 + human_soc 1 = 서로 다른 2개 영역뿐 → 미충족 (lit_art는 딴 영역으로 감)
    expect(area.satisfied).toBe(false)
  })
})

describe('감사 후속 — graduatable_after_current 전 축 재투영 (#7 회귀) · severity', () => {
  it('일반과정: 이번 학기 부전공 완성 → graduatable_after_current (majorPolicy 재투영)', () => {
    const b = baseGeneral({
      minorTag: 'am_minor',
      minorCredits: 18, // 완료 18 < 21
      profile: { additionalMajors: [{ ruleId: 'am_minor', active: true }] },
    })
    b.additionalMajorRules = [AM_MINOR]
    // 부전공 마지막 3학점을 이번 학기 수강중으로
    b.courses = b.courses.concat(
      mk('MINOR-FILL', { state: 'enrolled', grade: null, countsToward: ['am_minor'] })
    )
    const r = evaluate(b)
    expect(r.majorPolicy.satisfied).toBe(false) // 현재는 미충족
    expect(r.verdict).toBe('graduatable_after_current') // 수강중 완성 가정 시 충족
  })

  it('graduatable_after_current일 때 blocker는 모두 pending', () => {
    const courses = [
      ...commonRequired(),
      mk('SW-CAPSTONE'),
      mk('SW-SELF-PROJECT'),
      ...fill('SW-EFILL', 10),
      mk('SW-EFILL-1'),
      ...fill('GE-FILL', 7),
      ...fill('GE-FILL', 2, { state: 'enrolled', grade: null }),
      mk('GE-FILL-1', { state: 'enrolled', grade: null }),
    ]
    const r = evaluate({ ...baseAdvanced(), courses })
    expect(r.verdict).toBe('graduatable_after_current')
    expect(r.blockers.length).toBeGreaterThan(0)
    expect(r.blockers.every((x) => x.severity === 'pending')).toBe(true)
  })

  it('blocking과 pending 혼재 시 blocking이 먼저 정렬된다', () => {
    // 운영체제 미이수(blocking, 수강중 아님) + 일반선택 일부 수강중(pending)
    const courses = [
      ...commonRequired().filter((c) => c.courseKey !== 'SW-OS'), // 전필 blocking
      mk('SW-CAPSTONE'),
      mk('SW-SELF-PROJECT'),
      ...fill('SW-EFILL', 10),
      mk('SW-EFILL-1'),
      ...fill('GE-FILL', 6),
      mk('GE-FILL-1'),
      ...fill('GE-FILL', 3, { state: 'enrolled', grade: null }), // 일반선택 pending
    ]
    const r = evaluate({ ...baseAdvanced(), courses })
    expect(r.verdict).toBe('not_graduatable')
    expect(r.blockers[0]!.severity).toBe('blocking') // 정렬: blocking 먼저
    expect(r.blockers.some((x) => x.severity === 'pending')).toBe(true)
  })
})
