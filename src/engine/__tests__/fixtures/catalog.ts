/**
 * 테스트용 2021 SW 교과목 카탈로그.
 *
 * 부록 B(교과목 카탈로그)를 엔진 검증에 필요한 범위로 옮긴 것.
 * 2단계에서 만들 정식 data/catalog-2021-sw.json 의 원형이지만,
 * 여기서는 엔진 45건 테스트를 돌리기 위한 픽스처다.
 */

import type { CatalogEntry } from '../../types.js'

type Extra = Partial<Omit<CatalogEntry, 'courseKey' | 'name' | 'credits' | 'defaultBucket'>>

function c(
  courseKey: string,
  name: string,
  credits: number,
  defaultBucket: string,
  extra: Extra = {}
): CatalogEntry {
  return { courseKey, name, credits, defaultBucket, active: true, ...extra }
}

export const CATALOG: CatalogEntry[] = [
  // ── 대학필수 ──
  c('GE-AJOU-CHARACTER', '아주인성', 1, 'ajou_character'),
  c('GE-ENGLISH-1', '영어1', 3, 'english', { codes: ['GEB101'] }),
  c('GE-ENGLISH-2', '영어2', 3, 'english', { codes: ['GEB102'] }),
  c('GE-WRITING', '글쓰기', 3, 'writing'),
  // 영역별교양(area 지정)
  c('GE-AREA-HIST', '서양사의이해', 3, 'area_liberal', { area: 'hist_phil' }),
  c('GE-AREA-HIST-2', '동양철학산책', 3, 'area_liberal', { area: 'hist_phil' }),
  c('GE-AREA-HIST-3', '한국사탐구', 3, 'area_liberal', { area: 'hist_phil' }),
  c('GE-AREA-ART', '음악의이해', 3, 'area_liberal', { area: 'lit_art' }),
  c('GE-AREA-SOC', '사회학입문', 3, 'area_liberal', { area: 'human_soc' }),

  // ── 학과필수: SW커리어세미나 / 수학 / 기초과학 ──
  c('SW-CAREER-SEMINAR', 'SW커리어세미나', 1, 'sw_seminar', { codes: ['SCE191'] }),
  c('MATH-1', '수학1', 3, 'math'),
  c('MATH-2', '수학2', 3, 'math'),
  c('MATH-PROB-1', '확률및통계1', 3, 'math'),
  c('MATH-PROB-2', '확률및통계2', 3, 'math'),
  c('MATH-LINEAR-1', '선형대수1', 3, 'math'),
  c('SCI-PHYSICS', '물리학', 3, 'science_basic'),
  c('SCI-BIOLOGY', '생명과학', 3, 'science_basic'),
  c('SCI-PHYSICS-LAB', '물리학실험', 1, 'science_basic'),
  c('SCI-BIOLOGY-LAB', '생명과학실험', 1, 'science_basic'),
  c('SCI-CHEMISTRY', '화학', 3, 'science_basic'),

  // ── 전공필수 (11과목 36학점) ──
  c('SW-PROGRAMMING', '컴퓨터프로그래밍및실습', 4, 'major_required', {
    codes: ['SCE103'],
    aliases: ['컴퓨터프로그래밍'],
    gradingType: 'ABF',
  }),
  c('SW-DISCRETE-MATH', '이산수학', 3, 'major_required', { codes: ['SCE141'] }),
  c('SW-CREATIVE-SW-INTRO', '창의소프트웨어입문', 3, 'major_required', { codes: ['SCE192'] }),
  c('SW-DIGITAL-CIRCUIT', '디지털회로', 3, 'major_required', { codes: ['SCE112'] }),
  c('SW-OOP', '객체지향프로그래밍및실습', 4, 'major_required', {
    codes: ['SCE204'],
    prerequisites: ['SW-PROGRAMMING'],
  }),
  c('SW-DATA-STRUCT', '자료구조', 3, 'major_required', {
    codes: ['SCE205', 'SCE202'], // 요람 내 중복 표기 → codes 배열
    prerequisites: ['SW-PROGRAMMING'],
  }),
  c('SW-COMP-ARCH', '컴퓨터구조', 3, 'major_required', { codes: ['SCE212'] }),
  c('SW-SYS-PROGRAMMING', '시스템프로그래밍및실습', 4, 'major_required', { codes: ['SCE214'] }),
  c('SW-ALGORITHM', '알고리즘', 3, 'major_required', { codes: ['SCE231', 'SCE332'] }),
  c('SW-NETWORK', '컴퓨터네트워크', 3, 'major_required', { codes: ['SCE221'] }),
  c('SW-OS', '운영체제', 3, 'major_required', { codes: ['SCE213'] }),

  // ── 전공선택 (산학프로젝트 과목군 포함) ──
  c('SW-CAPSTONE', 'SW캡스톤디자인', 3, 'major_elective', {
    codes: ['SCE491'],
    courseGroups: ['capstone'],
  }),
  c('SW-SELF-PROJECT', '자기주도프로젝트', 3, 'major_elective', {
    codes: ['SCE395'],
    courseGroups: ['selfproj'],
  }),
  c('SW-IT-INTENSIVE-1', 'IT집중교육1', 3, 'major_elective', {
    codes: ['SCE393'],
    courseGroups: ['intensive'],
  }),
  c('SW-IT-INTENSIVE-2', 'IT집중교육2', 3, 'major_elective', {
    codes: ['SCE394'],
    courseGroups: ['intensive'],
  }),
  c('SW-IND-SEMINAR', 'SW산업세미나', 1, 'major_elective', { codes: ['SCE391'] }),
  c('SW-AI-INTRO', '인공지능입문', 3, 'major_elective'),
  // 현장실습 과목군 (상한·이월 대상)
  c('SW-FIELD-1', 'SW현장실습1', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-FIELD-2', 'SW현장실습2', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-FIELD-3', 'SW현장실습3', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-FIELD-4', 'SW현장실습4', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-FIELD-5', 'SW현장실습5', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-FIELD-6', 'SW현장실습6', 3, 'major_elective', { courseGroups: ['field'] }),
  c('SW-STARTUP-1', '창업실습1', 3, 'major_elective', { courseGroups: ['startup'] }),
  c('SW-STARTUP-2', '창업실습2', 3, 'major_elective', { courseGroups: ['startup'] }),
  // 해외인턴십: 표기 흔들림(별칭) + 중복 학수번호(INF0401)
  c('SW-INTERN-1', '해외인턴십1', 3, 'major_elective', {
    codes: ['INF0401'],
    aliases: ['해외인턴쉽1'],
    courseGroups: ['field'],
  }),
  // 학수번호 중복(SCE411)이 서로 다른 두 과목에 부여됨
  c('SW-MODEL-SIM', '모델링시뮬레이션', 3, 'major_elective', { codes: ['SCE411'] }),
  c('SW-ADV-COMP-ARCH', '고급컴퓨터구조', 3, 'major_elective', { codes: ['SCE411'] }),

  // ── 채움용 일반 전공선택 / 일반선택 (학점 채우기) ──
  c('SW-EFILL', '전공선택(일반)', 3, 'major_elective'),
  c('SW-EFILL-1', '전공선택(1학점)', 1, 'major_elective'),
  c('GE-FILL', '일반선택(교양)', 3, 'general_elective'),
  c('GE-FILL-1', '일반선택(1학점)', 1, 'general_elective'),
  c('MINOR-FILL', '부전공과목', 3, 'general_elective'),

  // ── H 테스트용 중복 인정 과목(부분합 확인) ──
  c('OV-4', '중복인정4학점', 4, 'major_elective'),
  c('OV-3A', '중복인정3학점A', 3, 'major_elective'),
  c('OV-3B', '중복인정3학점B', 3, 'major_elective'),
  c('OV-3C', '중복인정3학점C', 3, 'major_elective'),
  c('OV-1', '중복인정1학점', 1, 'major_elective'),
]
