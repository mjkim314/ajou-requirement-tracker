import { describe, expect, it } from 'vitest'
import type { CatalogEntry, Course, RequirementSet } from '../engine/index'
import {
  blankDraft,
  courseToDraft,
  draftToCourse,
  groupBySemester,
  hasErrors,
  isValidSemester,
  normalizeSemester,
  parseSemester,
  previewBucketId,
  catalogByKey,
  semesterLabel,
  semesterSortKey,
  validateDraft,
  type CourseDraft,
} from './courses'

const countsAll = () => true

// ── 픽스처 ────────────────────────────────────────────────
const REQ_SET: RequirementSet = {
  schemaVersion: 1,
  requirementVersion: 'test',
  id: 'rs_test',
  name: '테스트 세트',
  trackType: 'advanced',
  totalCredits: 130,
  minGPA: 2,
  buckets: [
    { id: 'major_required', label: '전공필수', group: 'major_required', minCredits: 36, requiredCourses: ['SW-OOP'] },
    {
      id: 'major_elective',
      label: '전공선택',
      group: 'major_elective',
      minCredits: 30,
      choiceGroups: [{ id: 'g1', label: '택1', pick: 1, courses: ['SW-DB'] }],
    },
    { id: 'general_elective', label: '일반선택', group: 'general_elective', minCredits: 20 },
  ],
  nonCurricular: [],
}

const CATALOG: CatalogEntry[] = [
  { courseKey: 'SW-OOP', name: '객체지향', credits: 3, defaultBucket: 'major_elective' },
  { courseKey: 'SW-DB', name: '데이터베이스', credits: 3, defaultBucket: 'general_elective' },
  { courseKey: 'SW-ETC', name: '기타과목', credits: 3, defaultBucket: 'major_elective' },
]
const CAT_MAP = catalogByKey(CATALOG)

function course(over: Partial<Course>): Course {
  return {
    id: 'x',
    semester: '2022-1',
    courseKey: null,
    nameSnapshot: '이름',
    credits: 3,
    state: 'completed',
    grade: 'A0',
    ...over,
  }
}

// ── 학기 ──────────────────────────────────────────────────
describe('학기 파싱·정렬·라벨', () => {
  it('parseSemester', () => {
    expect(parseSemester('2022-1')).toEqual({ year: 2022, slot: '1' })
    expect(parseSemester('2022-S')).toEqual({ year: 2022, slot: 'S' })
    expect(parseSemester('bad')).toBeNull()
  })

  it('normalizeSemester: 공백 제거 + 대문자화', () => {
    expect(normalizeSemester('  2022-s ')).toBe('2022-S')
    expect(normalizeSemester('2022-1')).toBe('2022-1')
  })

  it('isValidSemester는 소문자 s와 앞뒤 공백을 정규화 후 허용한다', () => {
    expect(isValidSemester('2022-2')).toBe(true)
    expect(isValidSemester('2022-s')).toBe(true)
    expect(isValidSemester(' 2022-1 ')).toBe(true)
    expect(isValidSemester('2022-3')).toBe(false)
    expect(isValidSemester('22-1')).toBe(false)
  })

  it('semesterSortKey 순서: 1학기 < 계절 < 2학기 < 다음해', () => {
    expect(semesterSortKey('2022-1')).toBeLessThan(semesterSortKey('2022-S'))
    expect(semesterSortKey('2022-S')).toBeLessThan(semesterSortKey('2022-2'))
    expect(semesterSortKey('2022-2')).toBeLessThan(semesterSortKey('2023-1'))
  })

  it('semesterLabel', () => {
    expect(semesterLabel('2022-1')).toBe('2022년 1학기')
    expect(semesterLabel('2022-S')).toBe('2022년 계절학기')
    expect(semesterLabel('')).toBe('학기 미지정')
  })
})

// ── 그룹 ──────────────────────────────────────────────────
describe('groupBySemester', () => {
  const courses: Course[] = [
    course({ id: '1', semester: '2021-2', nameSnapshot: '나', credits: 3, state: 'completed' }),
    course({ id: '2', semester: '2022-2', nameSnapshot: '가', credits: 3, state: 'completed' }),
    course({ id: '3', semester: '2022-1', nameSnapshot: '다', credits: 3, state: 'completed' }),
    course({ id: '4', semester: '2022-1', nameSnapshot: '가', credits: 2, state: 'planned' }),
  ]

  it('최신 학기부터 내림차순으로 묶는다', () => {
    const g = groupBySemester(courses, countsAll)
    expect(g.map((x) => x.semester)).toEqual(['2022-2', '2022-1', '2021-2'])
  })

  it('학기 안은 과목명 가나다순', () => {
    const g = groupBySemester(courses, countsAll)
    const sem1 = g.find((x) => x.semester === '2022-1')!
    expect(sem1.courses.map((c) => c.nameSnapshot)).toEqual(['가', '다'])
  })

  it('학기 학점 합은 countsForCredit 콜백이 참인 과목만 더한다(엔진 재사용)', () => {
    // 완료만 인정하는 콜백 → 2022-1은 '다'(완료 3)만, '가'(예정 2)는 제외 → 3
    const g = groupBySemester(courses, (c) => c.state === 'completed')
    const sem1 = g.find((x) => x.semester === '2022-1')!
    expect(sem1.credits).toBe(3)
  })

  it('학점 합은 상태가 아니라 콜백이 결정한다(F·대체 과목 제외를 엔진에 위임)', () => {
    // id '3'(완료)을 콜백으로 제외하면, 완료임에도 합에서 빠지고 '가'(2)만 남는다.
    const g = groupBySemester(courses, (c) => c.id !== '3')
    const sem1 = g.find((x) => x.semester === '2022-1')!
    expect(sem1.credits).toBe(2)
  })
})

// ── 영역 프리뷰 ────────────────────────────────────────────
describe('previewBucketId — 엔진과 동일한 귀속 우선순위', () => {
  it('requiredCourses 직접 키(2순위)', () => {
    expect(previewBucketId({ courseKey: 'SW-OOP', bucketOverride: null }, CAT_MAP, REQ_SET)).toBe(
      'major_required',
    )
  })

  it('choiceGroups 직접 키(3순위)', () => {
    expect(previewBucketId({ courseKey: 'SW-DB', bucketOverride: null }, CAT_MAP, REQ_SET)).toBe(
      'major_elective',
    )
  })

  it('카탈로그 defaultBucket(5순위)', () => {
    expect(previewBucketId({ courseKey: 'SW-ETC', bucketOverride: null }, CAT_MAP, REQ_SET)).toBe(
      'major_elective',
    )
  })

  it('미확인 과목은 폴백(일반선택)', () => {
    expect(previewBucketId({ courseKey: null, bucketOverride: null }, CAT_MAP, REQ_SET)).toBe(
      'general_elective',
    )
  })

  it('사용자 지정(bucketOverride)이 최우선', () => {
    expect(
      previewBucketId({ courseKey: 'SW-OOP', bucketOverride: 'general_elective' }, CAT_MAP, REQ_SET),
    ).toBe('general_elective')
  })

  it('대체 규칙(equivalents)으로 도달하는 영역도 반영한다(4순위, 엔진과 일치)', () => {
    // SW-NEW는 어느 bucket에도 직접 없지만, equivalent로 SW-OOP(major_required)에 도달.
    const reqSetEq: RequirementSet = {
      ...REQ_SET,
      equivalents: [
        { id: 'eq1', type: 'sameAs', from: 'SW-NEW', to: 'SW-OOP', direction: 'bidirectional' },
      ],
    }
    expect(previewBucketId({ courseKey: 'SW-NEW', bucketOverride: null }, CAT_MAP, reqSetEq, 2021)).toBe(
      'major_required',
    )
    // 대체 규칙이 없으면(4순위 미도달) 폴백으로 떨어진다.
    expect(previewBucketId({ courseKey: 'SW-NEW', bucketOverride: null }, CAT_MAP, REQ_SET)).toBe(
      'general_elective',
    )
  })
})

// ── 검증 ──────────────────────────────────────────────────
describe('validateDraft', () => {
  const base: CourseDraft = {
    courseKey: 'SW-OOP',
    nameSnapshot: '객체지향',
    credits: 3,
    semester: '2022-1',
    state: 'completed',
    grade: 'A0',
    bucketOverride: null,
    retakeOf: null,
    countsToward: null,
    memo: null,
  }

  it('정상 초안은 오류 없음', () => {
    expect(hasErrors(validateDraft(base))).toBe(false)
  })

  it('빈 과목명·0학점·잘못된 학기를 잡는다', () => {
    const e = validateDraft({ ...base, nameSnapshot: '  ', credits: 0, semester: 'x' })
    expect(e.nameSnapshot).toBeDefined()
    expect(e.credits).toBeDefined()
    expect(e.semester).toBeDefined()
  })

  it('완료인데 성적이 없으면 오류', () => {
    expect(validateDraft({ ...base, grade: null }).grade).toBeDefined()
  })

  it('재수강인데 이전 과목 연결이 없으면 오류', () => {
    const e = validateDraft({ ...base, state: 'retake_planned', grade: 'B0', retakeOf: null })
    expect(e.retakeOf).toBeDefined()
  })

  it('미확인 과목은 영역을 직접 지정해야 한다', () => {
    const e = validateDraft({ ...base, courseKey: null, bucketOverride: null })
    expect(e.bucketOverride).toBeDefined()
    // 영역을 지정하면 통과
    expect(validateDraft({ ...base, courseKey: null, bucketOverride: 'general_elective' }).bucketOverride).toBeUndefined()
  })

  it('수강중은 성적이 없어도 통과', () => {
    expect(hasErrors(validateDraft({ ...base, state: 'enrolled', grade: null }))).toBe(false)
  })

  it('소문자 s·공백이 붙은 학기도 정규화 후 통과', () => {
    expect(validateDraft({ ...base, semester: '2022-s' }).semester).toBeUndefined()
    expect(validateDraft({ ...base, semester: ' 2022-1 ' }).semester).toBeUndefined()
  })
})

// ── 변환 ──────────────────────────────────────────────────
describe('draftToCourse', () => {
  const base: CourseDraft = blankDraft('2022-1')

  it('성적 없는 상태는 grade를 null로 정리', () => {
    const c = draftToCourse({ ...base, nameSnapshot: '가', credits: 3, state: 'enrolled', grade: 'A0' }, 'id1')
    expect(c.grade).toBeNull()
    expect(c.isPassFail).toBe(false)
  })

  it('P 성적은 isPassFail=true', () => {
    const c = draftToCourse({ ...base, nameSnapshot: '가', credits: 3, state: 'completed', grade: 'P' }, 'id2')
    expect(c.isPassFail).toBe(true)
  })

  it('완료 재수강 결과는 retakeOf를 보존', () => {
    const c = draftToCourse(
      { ...base, nameSnapshot: '가', credits: 3, state: 'completed', grade: 'A0', retakeOf: 'old-1' },
      'id3',
    )
    expect(c.retakeOf).toBe('old-1')
  })

  it('메모 공백은 null로 정리', () => {
    const c = draftToCourse({ ...base, nameSnapshot: '가', credits: 3, grade: 'A0', memo: '   ' }, 'id4')
    expect(c.memo).toBeNull()
  })

  it('학기를 정규화해 저장(2022-s → 2022-S)', () => {
    const c = draftToCourse({ ...base, nameSnapshot: '가', credits: 3, grade: 'A0', semester: '2022-s' }, 'id5')
    expect(c.semester).toBe('2022-S')
  })

  it('countsToward(추가전공 태그)를 편집 왕복에서 보존', () => {
    const original: Course = course({
      id: 'r5',
      nameSnapshot: '가',
      credits: 3,
      state: 'completed',
      grade: 'A0',
      countsToward: ['primary', 'am_cs_double'],
    })
    const round = draftToCourse(courseToDraft(original), 'r5')
    expect(round.countsToward).toEqual(['primary', 'am_cs_double'])
  })

  it('courseToDraft ↔ draftToCourse 왕복', () => {
    const original: Course = course({
      id: 'r1',
      courseKey: 'SW-OOP',
      nameSnapshot: '객체지향',
      credits: 3,
      state: 'completed',
      grade: 'B+',
      bucketOverride: 'general_elective',
    })
    const round = draftToCourse(courseToDraft(original), 'r1')
    expect(round.courseKey).toBe('SW-OOP')
    expect(round.grade).toBe('B+')
    expect(round.bucketOverride).toBe('general_elective')
  })
})
