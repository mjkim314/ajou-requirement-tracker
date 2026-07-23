/**
 * 테스트용 2021 SW 요건 세트(심화/일반)와 추가 전공 규칙.
 *
 * 부록 A(기본 프리셋)·C(대체 규칙)를 옮긴 것. 심화·일반은 같은 정의에서
 * major_elective 최소 학점만 데이터로 분기한다(37 vs 10) — 엔진 코드 수정 없이 동작함을 보이기 위함.
 */

import type {
  AdditionalMajorRule,
  Bucket,
  Requirement,
  RequirementSet,
} from '../../types.js'

const GRADE_POINTS = {
  'A+': 4.5,
  A0: 4.0,
  'B+': 3.5,
  B0: 3.0,
  'C+': 2.5,
  C0: 2.0,
  'D+': 1.5,
  D0: 1.0,
  F: 0,
} as const

/** 영역(Bucket) 정의는 심화·일반 공통, major_elective 최소 학점만 인자로 받는다. */
function buildBuckets(majorElectiveMin: number): Bucket[] {
  return [
    // 대학필수
    { id: 'ajou_character', label: '아주인성', group: 'university_required', minCredits: 1, requiredCourses: ['GE-AJOU-CHARACTER'] },
    { id: 'english', label: '영어', shortLabel: '영어', group: 'university_required', minCredits: 6, requiredCourses: ['GE-ENGLISH-1', 'GE-ENGLISH-2'] },
    { id: 'writing', label: '글쓰기', group: 'university_required', minCredits: 3, requiredCourses: ['GE-WRITING'] },
    {
      id: 'area_liberal',
      label: '영역별교양',
      shortLabel: '영역별교양',
      group: 'university_required',
      minCredits: 9,
      minDistinctAreas: 3,
      areas: [
        { id: 'hist_phil', label: '역사와 철학', minCourses: 1 },
        { id: 'lit_art', label: '문학과 예술', minCourses: 1 },
        { id: 'human_soc', label: '인간과 사회', minCourses: 1 },
      ],
    },
    // 학과필수
    { id: 'sw_seminar', label: 'SW커리어세미나', group: 'department_required', minCredits: 1, requiredCourses: ['SW-CAREER-SEMINAR'] },
    {
      id: 'math',
      label: '수학',
      group: 'department_required',
      minCredits: 12,
      requiredCourses: ['MATH-1', 'MATH-2', 'MATH-PROB-1'],
      choiceGroups: [
        {
          id: 'math_choice',
          label: '확률및통계2 또는 선형대수1',
          pick: 1,
          courses: ['MATH-PROB-2', 'MATH-LINEAR-1'],
        },
      ],
    },
    {
      id: 'science_basic',
      label: '기초과학',
      group: 'department_required',
      minCredits: 7,
      choiceGroups: [
        { id: 'sci_main', label: '물리학 또는 생명과학', pick: 1, courses: ['SCI-PHYSICS', 'SCI-BIOLOGY'] },
        { id: 'sci_lab', label: '해당 실험', pick: 1, courses: ['SCI-PHYSICS-LAB', 'SCI-BIOLOGY-LAB'], linkedTo: 'sci_main' },
        { id: 'sci_extra', label: '물리학/생명과학/화학 중 택1', pick: 1, courses: ['SCI-PHYSICS', 'SCI-BIOLOGY', 'SCI-CHEMISTRY'] },
      ],
    },
    // 전공
    {
      id: 'major_required',
      label: '전공필수',
      shortLabel: '전필',
      group: 'major_required',
      minCredits: 36,
      requiredCourses: [
        'SW-PROGRAMMING', 'SW-DISCRETE-MATH', 'SW-CREATIVE-SW-INTRO', 'SW-DIGITAL-CIRCUIT',
        'SW-OOP', 'SW-DATA-STRUCT', 'SW-COMP-ARCH', 'SW-SYS-PROGRAMMING',
        'SW-ALGORITHM', 'SW-NETWORK', 'SW-OS',
      ],
    },
    { id: 'major_elective', label: '전공선택', shortLabel: '전공선택', group: 'major_elective', minCredits: majorElectiveMin },
    // 일반선택 (폴백 대상)
    { id: 'general_elective', label: '일반선택', shortLabel: '일반선택', group: 'general_elective', minCredits: 28 },
  ]
}

/** 비교과 요건 — 심화·일반 공통. appliesWhen(trackType)으로 자동 활성/비활성. */
const NON_CURRICULAR: Requirement[] = [
  {
    id: 'english_cert',
    label: '외국어(영어) 공인 성적',
    shortLabel: '영어 인증',
    type: 'alternatives',
    pick: 1,
    appliesWhen: null,
    alternatives: [
      { id: 'toeic', label: 'TOEIC', type: 'score', min: 730 },
      { id: 'teps', label: 'TEPS', type: 'score', min: 605 },
      { id: 'toefl_pbt', label: 'TOEFL PBT', type: 'score', min: 534 },
      { id: 'toefl_cbt', label: 'TOEFL CBT', type: 'score', min: 200 },
      { id: 'toefl_ibt', label: 'TOEFL iBT', type: 'score', min: 72 },
      { id: 'gtelp_2', label: 'G-TELP Level 2', type: 'score', min: 67 },
      { id: 'gtelp_3', label: 'G-TELP Level 3', type: 'score', min: 89 },
      { id: 'toeic_sp', label: 'TOEIC Speaking', type: 'level', min: 'Lv.5', scale: ['Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5', 'Lv.6', 'Lv.7', 'Lv.8'] },
      { id: 'opic', label: 'OPIc', type: 'level', min: 'IL', scale: ['NL', 'NM', 'NH', 'IL', 'IM', 'IH', 'AL'] },
    ],
  },
  {
    id: 'major_ability',
    label: '전공 역량 인증',
    shortLabel: '전공 역량 인증',
    type: 'count',
    min: 2,
    unit: '회',
    appliesWhen: { field: 'trackType', op: 'eq', value: 'advanced' },
  },
  {
    id: 'industry_project',
    label: '산학프로젝트 인증',
    shortLabel: '산학프로젝트',
    type: 'courseGroupPick',
    pick: 2,
    appliesWhen: { field: 'trackType', op: 'eq', value: 'advanced' },
    groups: [
      { id: 'intensive', label: 'IT집중교육과목군', courses: ['SW-IT-INTENSIVE-1', 'SW-IT-INTENSIVE-2'] },
      { id: 'selfproj', label: '자기주도프로젝트', courses: ['SW-SELF-PROJECT'] },
      { id: 'field', label: '현장실습과목군', courses: ['SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6', 'SW-INTERN-1'] },
      { id: 'startup', label: '창업실습과목군', courses: ['SW-STARTUP-1', 'SW-STARTUP-2'] },
      { id: 'capstone', label: '캡스톤디자인과목군', courses: ['SW-CAPSTONE'] },
    ],
  },
  {
    id: 'programming_cert',
    label: '프로그래밍 역량 인증',
    shortLabel: '프로그래밍 역량 인증',
    type: 'alternatives',
    pick: 1,
    appliesWhen: { field: 'trackType', op: 'eq', value: 'advanced' },
    alternatives: [
      { id: 'topcit', label: 'TOPCIT', type: 'score', min: 190, unit: '점' },
      { id: 'contest', label: '자체 경시대회 점수 획득', type: 'check' },
    ],
  },
]

function buildSet(opts: {
  id: string
  name: string
  trackType: string
  majorElectiveMin: number
}): RequirementSet {
  return {
    schemaVersion: 2,
    requirementVersion: `2021-sw-${opts.trackType}-v1`,
    id: opts.id,
    name: opts.name,
    admissionYearFrom: 2021,
    admissionYearTo: 2021,
    college: '소프트웨어융합대학',
    department: '소프트웨어학과',
    trackType: opts.trackType,
    totalCredits: 140,
    minGPA: 2.0,
    gradePoints: { ...GRADE_POINTS },
    buckets: buildBuckets(opts.majorElectiveMin),
    nonCurricular: NON_CURRICULAR,
    equivalents: [
      // 부록 C: 학번 개정으로 창의소프트웨어입문 ↔ 인공지능입문 상호 인정
      // (테스트에서 활성화하기 위해 effectiveFrom을 두지 않음)
      { id: 'eq_creative_ai', type: 'replaces', from: 'SW-CREATIVE-SW-INTRO', to: 'SW-AI-INTRO', direction: 'bidirectional', creditPolicy: 'useOriginal' },
    ],
    courseGroups: [
      {
        id: 'field_practice',
        label: '현장실습 과목군',
        courses: ['SW-FIELD-1', 'SW-FIELD-2', 'SW-FIELD-3', 'SW-FIELD-4', 'SW-FIELD-5', 'SW-FIELD-6', 'SW-INTERN-1', 'SW-STARTUP-1', 'SW-STARTUP-2'],
        creditCap: 6,
        capBucket: 'major_elective',
        overflowTo: 'general_elective',
      },
    ],
    majorPolicy: {
      satisfiedBy: ['advanced_track', 'additional_major'],
      minAdditionalMajorCount: 1,
      requiredWhen: { field: 'trackType', op: 'neq', value: 'advanced' },
      exemptions: ['dual_degree', 'linked_masters'],
    },
    source: { document: '2021 아주대학교 요람', pages: '336-340', verifiedAt: '2026-07-20' },
  }
}

export const ADVANCED_SET = buildSet({
  id: 'rs_2021_sw_advanced',
  name: '2021 소프트웨어학과 · 심화과정',
  trackType: 'advanced',
  majorElectiveMin: 37,
})

export const GENERAL_SET = buildSet({
  id: 'rs_2021_sw_general',
  name: '2021 소프트웨어학과 · 일반과정',
  trackType: 'general',
  majorElectiveMin: 10,
})

// ── 추가 전공 규칙 ──

export const AM_DOUBLE: AdditionalMajorRule = {
  id: 'am_hsda_double',
  name: '인문사회데이터분석전공',
  type: 'double_major',
  typeLabel: '복수전공',
  totalMinCredits: 36,
  homeOverlapCap: 6,
  satisfiesMajorPolicy: true,
  sourceNote: '2021 요람 p.350',
}

export const AM_MINOR: AdditionalMajorRule = {
  id: 'am_minor',
  name: '소프트웨어부전공',
  type: 'minor',
  typeLabel: '부전공',
  totalMinCredits: 21,
  homeOverlapCap: 3,
  satisfiesMajorPolicy: true,
}

/** 이수해도 전공 이수원칙을 충족시키지 못하는 전공(E-05). */
export const AM_NONSAT: AdditionalMajorRule = {
  id: 'am_nonsat',
  name: '비인정전공',
  type: 'double_major',
  typeLabel: '복수전공',
  totalMinCredits: 21,
  homeOverlapCap: 6,
  satisfiesMajorPolicy: false,
}

export const AM_RULES = [AM_DOUBLE, AM_MINOR, AM_NONSAT]
