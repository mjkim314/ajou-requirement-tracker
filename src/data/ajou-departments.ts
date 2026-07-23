/**
 * 아주대 현행(2026 기준) 학부 단과대학·학과 큐레이션 목록.
 *
 * 온보딩 "학과 선택" 드롭다운의 데이터. 요건 숫자가 아니라 학과 정체성(이름·소속·구명칭)이며,
 * 프리셋 유무는 여기서 판단하지 않는다(요건 세트 레지스트리에서 runtime 조회).
 *
 * 출처: 레포 내 `.claude/skills/yoram-extract/references/naming.md`(공식 기준)를 최우선으로,
 * naming.md가 열거하지 않은 대학·학과는 아주대 공식 사이트(ajou.ac.kr)로 교차검증.
 * 통합학부(경제정치사회융합학부·프런티어과학학부)·첨단바이오 전공단위는 내부 전공별 요건이
 * 갈릴 수 있어, 구 학과명을 aliases로 보존한다.
 */

export interface DepartmentEntry {
  /** 현행 정규 학과/학부명(2026 기준). */
  name: string
  /** 구명칭·검색용 이표기(개명·통합 전 학과명 포함). */
  aliases: string[]
  /** naming.md에 정의된 slug. 없으면 null. */
  slug: string | null
  note: string | null
}

export interface CollegeEntry {
  college: string
  slug: string | null
  aliases: string[]
  departments: DepartmentEntry[]
  /**
   * 요람·요건 세트 데이터가 레포에 없는 대학(의·약·간호·국제학부).
   * 온보딩에서 고를 수는 있으나 "요건 데이터 준비 안 됨"을 안내한다.
   */
  curriculumDataMissing?: boolean
}

/** 단과대학별 그룹(드롭다운 optgroup 순서). */
export const AJOU_COLLEGES: CollegeEntry[] = [
  {
    college: '소프트웨어융합대학',
    slug: 'swc',
    aliases: ['정보통신대학'],
    departments: [
      { name: '소프트웨어학과', aliases: [], slug: 'sw', note: null },
      { name: '인공지능융합학과', aliases: ['인공지능융합전공'], slug: 'ai', note: null },
      { name: '사이버보안학과', aliases: [], slug: 'sec', note: null },
      { name: '디지털미디어학과', aliases: ['미디어학과'], slug: 'media', note: '2023 미디어학과에서 개명' },
      { name: '국방디지털융합학과', aliases: [], slug: 'ddc', note: null },
    ],
  },
  {
    college: '첨단ICT융합대학',
    slug: 'ict',
    aliases: ['정보통신대학'],
    departments: [
      { name: '전자공학과', aliases: [], slug: null, note: '구 정보통신대학 전자계열 잔류분' },
      { name: '지능형반도체공학과', aliases: [], slug: null, note: '2023 전자공학과에서 분리 신설' },
      { name: '미래모빌리티공학과', aliases: ['AI모빌리티공학과'], slug: 'aim', note: '2025 공과대학에서 이동·개명' },
    ],
  },
  {
    college: '공과대학',
    slug: 'eng',
    aliases: [],
    departments: [
      { name: '기계공학과', aliases: [], slug: 'me', note: null },
      { name: '산업공학과', aliases: [], slug: 'ie', note: null },
      { name: '화학공학과', aliases: [], slug: 'che', note: null },
      { name: '응용화학과', aliases: ['응용화학생명공학과'], slug: 'acbe', note: '2025 개명(생명전공 분리→첨단바이오)' },
      { name: '첨단신소재공학과', aliases: ['신소재공학과'], slug: 'mse', note: '2023 신소재공학과에서 개명' },
      { name: '건축학과', aliases: ['건축학부'], slug: 'arch', note: null },
      { name: '건설시스템공학과', aliases: [], slug: 'ce', note: null },
      { name: '교통시스템공학과', aliases: [], slug: 'tse', note: null },
      { name: '환경안전공학과', aliases: [], slug: 'ense', note: null },
      { name: '융합시스템공학과', aliases: [], slug: 'csys', note: null },
    ],
  },
  {
    college: '자연과학대학',
    slug: 'ns',
    aliases: [],
    departments: [
      { name: '수학과', aliases: [], slug: null, note: '2025 자연대 개편 시 학과로 잔류' },
      {
        name: '프런티어과학학부',
        aliases: ['물리학과', '화학과', '생명과학과'],
        slug: null,
        note: '2025 물리·화학·생명과학과 통합. 내부 전공별 요건이 다를 수 있음',
      },
    ],
  },
  {
    college: '경영대학',
    slug: 'biz',
    aliases: [],
    departments: [
      { name: '경영학과', aliases: [], slug: null, note: null },
      { name: '경영인텔리전스학과', aliases: ['e-비즈니스학과', 'e-비지니스학과'], slug: null, note: '2024 e-비즈니스학과에서 개명' },
      { name: '금융공학과', aliases: [], slug: null, note: null },
      { name: '글로벌경영학과', aliases: [], slug: null, note: null },
      { name: '국제경영학과', aliases: [], slug: null, note: '2025 신설' },
    ],
  },
  {
    college: '사회과학대학',
    slug: 'ss',
    aliases: [],
    departments: [
      {
        name: '경제정치사회융합학부',
        aliases: ['경제학과', '정치외교학과', '사회학과'],
        slug: null,
        note: '2025 경제·정치외교·사회학과 통합. 내부 전공별 요건이 다를 수 있음',
      },
      { name: '행정학과', aliases: [], slug: null, note: null },
      { name: '심리학과', aliases: [], slug: null, note: null },
      { name: '스포츠레저학과', aliases: [], slug: null, note: null },
    ],
  },
  {
    college: '인문대학',
    slug: 'hum',
    aliases: [],
    departments: [
      { name: '국어국문학과', aliases: [], slug: null, note: null },
      { name: '영어영문학과', aliases: [], slug: null, note: null },
      { name: '불어불문학과', aliases: [], slug: null, note: null },
      { name: '사학과', aliases: [], slug: null, note: null },
      { name: '문화콘텐츠학과', aliases: [], slug: null, note: null },
    ],
  },
  {
    college: '다산학부대학',
    slug: 'dasan',
    aliases: ['기초교육대학'],
    departments: [
      { name: '자유전공학부', aliases: [], slug: null, note: '2025 신설. 학생설계전공 이수 가능' },
      { name: '글로벌교양학부', aliases: ['글로벌 교양학부'], slug: null, note: '교양·외국인 한국어교육 담당' },
    ],
  },
  {
    college: '첨단바이오융합대학',
    slug: 'bio',
    aliases: [],
    departments: [
      { name: '혁신신약공학전공', aliases: [], slug: null, note: '전공 단위(단과대 입학 후 선택). 2025 개설' },
      { name: '바이오첨단소재공학전공', aliases: [], slug: null, note: '전공 단위. 2025 개설' },
      { name: '디지털바이오공학전공', aliases: [], slug: null, note: '전공 단위. 2026 신설' },
    ],
  },
  {
    college: '의과대학',
    slug: null,
    aliases: [],
    curriculumDataMissing: true,
    departments: [{ name: '의학과', aliases: [], slug: null, note: '요건 데이터 미비' }],
  },
  {
    college: '약학대학',
    slug: null,
    aliases: [],
    curriculumDataMissing: true,
    departments: [{ name: '약학과', aliases: [], slug: null, note: '요건 데이터 미비' }],
  },
  {
    college: '간호대학',
    slug: null,
    aliases: [],
    curriculumDataMissing: true,
    departments: [{ name: '간호학과', aliases: [], slug: null, note: '요건 데이터 미비' }],
  },
  {
    college: '국제학부',
    slug: null,
    aliases: [],
    curriculumDataMissing: true,
    departments: [{ name: '국제학부', aliases: [], slug: null, note: '독립 학부 · 요건 데이터 미비' }],
  },
]

export interface FlatDepartment extends DepartmentEntry {
  college: string
  collegeSlug: string | null
  curriculumDataMissing: boolean
}

/** 검색·조회용 평탄화 목록. */
export const AJOU_DEPARTMENTS: FlatDepartment[] = AJOU_COLLEGES.flatMap((c) =>
  c.departments.map((d) => ({
    ...d,
    college: c.college,
    collegeSlug: c.slug,
    curriculumDataMissing: c.curriculumDataMissing ?? false,
  })),
)

/** 학과명(또는 alias)으로 항목 조회. */
export function findDepartment(name: string): FlatDepartment | null {
  const n = name.trim()
  if (!n) return null
  return (
    AJOU_DEPARTMENTS.find((d) => d.name === n) ??
    AJOU_DEPARTMENTS.find((d) => d.aliases.includes(n)) ??
    null
  )
}
