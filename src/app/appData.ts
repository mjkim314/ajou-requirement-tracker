import type { Course, Profile } from '../engine/index'
import { catalog2021Sw, requirementSetRegistry } from '../data/index'
import { defaultSettings, type PersistedState } from '../storage/schema'

/*
 * 데모 시드 — 저장소가 비었을 때 사용자가 "데모 데이터로 둘러보기"를 누르면 채워지는 표본.
 * 온보딩(4단계)이 생기면 실제 입력이 이 자리를 대체한다.
 * 요건 숫자·학점은 전부 번들 데이터에서 오고, 과목은 실제 카탈로그의 courseKey로만 참조한다.
 */

const DEMO_SET_ID = 'rs_2021_sw_advanced'
const demoReqSet = requirementSetRegistry[DEMO_SET_ID]

const creditByKey = new Map(catalog2021Sw.map((e) => [e.courseKey, e.credits]))
const nameByKey = new Map(catalog2021Sw.map((e) => [e.courseKey, e.name]))

let seq = 0
function course(courseKey: string, grade: Course['grade'], semester: string): Course {
  seq += 1
  return {
    id: `demo-${seq}`,
    semester,
    courseKey,
    // 실제 입력은 자동완성이 카탈로그의 한글 과목명을 넣는다 — 데모도 동일하게 보이도록.
    nameSnapshot: nameByKey.get(courseKey) ?? courseKey,
    credits: creditByKey.get(courseKey) ?? 3,
    state: 'completed',
    grade,
  }
}

function demoCourses(): Course[] {
  return [
    course('GE-AJOU-CHARACTER', 'P', '2021-1'),
    course('GE-ENGLISH-1', 'A0', '2021-1'),
    course('GE-WRITING', 'B+', '2021-1'),
    course('MATH-1', 'B0', '2021-1'),
    course('SW-PROGRAMMING', 'A+', '2021-1'),
    course('GE-ENGLISH-2', 'A0', '2021-2'),
    course('GE-AREA-HIST', 'B+', '2021-2'),
    course('MATH-2', 'B0', '2021-2'),
    course('SW-DISCRETE-MATH', 'A0', '2021-2'),
    course('SW-CREATIVE-SW-INTRO', 'A+', '2021-2'),
    course('GE-AREA-SOC', 'A0', '2022-1'),
    course('SW-OOP', 'A0', '2022-1'),
    course('SW-DATA-STRUCT', 'B+', '2022-1'),
    course('SW-DIGITAL-CIRCUIT', 'B0', '2022-1'),
    course('SW-COMP-ARCH', 'A0', '2022-1'),
    {
      id: 'demo-enrolled-1',
      semester: '2022-2',
      courseKey: 'SW-ALGORITHM',
      nameSnapshot: nameByKey.get('SW-ALGORITHM') ?? 'SW-ALGORITHM',
      credits: creditByKey.get('SW-ALGORITHM') ?? 3,
      state: 'enrolled',
      grade: null,
    },
  ]
}

function demoProfile(): Profile {
  return {
    schemaVersion: 2,
    admissionYear: 2021,
    college: demoReqSet?.college ?? '소프트웨어융합대학',
    department: demoReqSet?.department ?? '소프트웨어학과',
    trackType: demoReqSet?.trackType ?? 'advanced',
    requirementSetId: DEMO_SET_ID,
    additionalMajors: [],
    exemptions: [],
    currentSemester: '2022-2',
    targetGraduation: '2025-2',
    onboardingCompleted: true,
  }
}

/** 데모 개인 상태 한 벌(매 호출 새 객체 — 시드 후 자유롭게 편집 가능). */
export function demoPersistedState(): PersistedState {
  seq = 0
  return {
    profile: demoProfile(),
    courses: demoCourses(),
    noncurricular: {
      english_cert: { alternatives: { opic: { level: 'IL' } } },
    },
    customSets: [],
    settings: defaultSettings(),
  }
}
