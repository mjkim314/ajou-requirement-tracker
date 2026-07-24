/**
 * R1 — 파일명 규약 기반 데이터 매니페스트.
 *
 * src/data/*.json 을 import.meta.glob 으로 열거하고 파일명을 파싱해
 * 레지스트리·번들을 자동 구성한다. 파일명 규약:
 *
 *   requirement-set-{학번}-{slug}.json        과정(track)별 요건 세트 묶음
 *   catalog-{학번}-{slug}.json                학과 카탈로그 (slug 'ge'는 다산 교양)
 *   additional-major-rules-{학번}-{slug}.json 추가전공 규칙
 *
 * 세트 id 는 `rs_{학번}_{slug}_{track}` 이어야 하며(manifest.test.ts 가 검증),
 * JSON 파일을 규약대로 추가하기만 하면 앱·테스트에 등록된다 — 손 등록 없음.
 *
 * 구성이 어긋나면(카탈로그 없는 세트, 세트 id 중복 등) 조용히 오동작하는 대신
 * 모듈 로드 시점에 즉시 던진다. "등록 누락 → 폴백 카탈로그 → 전 과목 미매칭"
 * 오류 계급을 소멸시키는 것이 이 계층의 존재 이유다(개선_방향_제안.md C-1).
 *
 * glob 은 eager 유지 — 번들 동작 불변(지연 로딩은 R7에서 검토).
 */

import type {
  AdditionalMajorRule,
  CatalogEntry,
  RequirementSet,
} from '../engine/types.js'

/** 요건 세트 1개가 쓰는 카탈로그·추가전공 규칙 묶음. */
export interface DataBundle {
  catalog: CatalogEntry[]
  rules: AdditionalMajorRule[]
}

/** 파일명에서 파싱한 데이터 파일 좌표(테스트 introspection 용). */
export interface ManifestFile {
  kind: 'set' | 'catalog' | 'amr'
  /** 파일명 basename (예: catalog-2021-sw.json). */
  file: string
  year: number
  /** 학과 slug(naming.md) 또는 'ge'(다산 교양). */
  slug: string
}

/** (학번 × 학과) 데이터셋 — 세트 묶음과 그 번들. */
export interface Dataset {
  year: number
  slug: string
  /** track 키(advanced/general/accredited …) → 요건 세트. */
  sets: Record<string, RequirementSet>
  bundle: DataBundle
}

/** 다산 교양 카탈로그의 slug. 교양은 세트·규칙 없이 카탈로그만 존재한다. */
export const GE_SLUG = 'ge'

// ── 파일 열거 · 파일명 파싱 ──────────────────────────────────

const setModules = import.meta.glob<Record<string, RequirementSet>>(
  './requirement-set-*.json',
  { eager: true, import: 'default' },
)
const catalogModules = import.meta.glob<CatalogEntry[]>('./catalog-*.json', {
  eager: true,
  import: 'default',
})
const amrModules = import.meta.glob<AdditionalMajorRule[]>(
  './additional-major-rules-*.json',
  { eager: true, import: 'default' },
)

function fail(message: string): never {
  throw new Error(`[data/manifest] ${message}`)
}

function parseName(path: string, kind: ManifestFile['kind'], prefix: string): ManifestFile {
  const file = path.split('/').pop()!
  const m = new RegExp(`^${prefix}-(\\d{4})-([a-z]+)\\.json$`).exec(file)
  if (!m) fail(`파일명 규약 위반: ${file} — ${prefix}-{학번}-{slug}.json 형태여야 한다`)
  return { kind, file, year: Number(m[1]), slug: m[2]! }
}

const datasetKey = (year: number, slug: string) => `${year}-${slug}`

/** 열거된 전 데이터 파일(파싱 좌표 포함). manifest.test.ts 가 규약 정합을 검사한다. */
export const MANIFEST_FILES: ManifestFile[] = [
  ...Object.keys(setModules).map((p) => parseName(p, 'set', 'requirement-set')),
  ...Object.keys(catalogModules).map((p) => parseName(p, 'catalog', 'catalog')),
  ...Object.keys(amrModules).map((p) => parseName(p, 'amr', 'additional-major-rules')),
].sort((a, b) => a.file.localeCompare(b.file))

// ── 좌표별 수집 ──────────────────────────────────────────────

const catalogByKey = new Map<string, CatalogEntry[]>()
const geByYear = new Map<number, CatalogEntry[]>()
for (const [path, catalog] of Object.entries(catalogModules)) {
  const { year, slug } = parseName(path, 'catalog', 'catalog')
  if (slug === GE_SLUG) geByYear.set(year, catalog)
  else catalogByKey.set(datasetKey(year, slug), catalog)
}

const rulesByKey = new Map<string, AdditionalMajorRule[]>()
for (const [path, rules] of Object.entries(amrModules)) {
  const { year, slug, file } = parseName(path, 'amr', 'additional-major-rules')
  if (slug === GE_SLUG) fail(`교양(ge)에는 추가전공 규칙이 없어야 한다: ${file}`)
  rulesByKey.set(datasetKey(year, slug), rules)
}

// ── 데이터셋 · 레지스트리 · 번들 자동 구성 ──────────────────

/** 학번 → 다산학부대학 교양 카탈로그. */
export const geCatalogByYear: Record<number, CatalogEntry[]> = Object.fromEntries(geByYear)

/** 교양 카탈로그 보유 학번(오름차순). */
export const geYears: number[] = [...geByYear.keys()].sort((a, b) => a - b)

/** requirementSetId → 요건 세트. 프로필의 requirementSetId 로 조회. */
export const requirementSetRegistry: Record<string, RequirementSet> = {}

/** 요건 세트 id → 매칭 카탈로그·추가전공 규칙. */
export const DATA_BUNDLES: Record<string, DataBundle> = {}

/** 학과명 → (학번 → 번들). dataSources 의 학번 폴백 정책이 이 위에서 동작한다. */
export const bundlesByDepartment: Record<string, Record<number, DataBundle>> = {}

/** (학번 × 학과) 데이터셋 전체 — 범용 무결성 스위트(R2)의 순회 대상. */
export const DATASETS: Dataset[] = Object.entries(setModules)
  .map(([path, sets]) => {
    const { year, slug, file } = parseName(path, 'set', 'requirement-set')
    if (slug === GE_SLUG) fail(`교양(ge)에는 요건 세트가 없어야 한다: ${file}`)
    const key = datasetKey(year, slug)
    const catalog = catalogByKey.get(key)
    if (!catalog) fail(`${file} 의 카탈로그(catalog-${key}.json)가 없다`)
    const rules = rulesByKey.get(key)
    if (!rules) fail(`${file} 의 추가전공 규칙(additional-major-rules-${key}.json)이 없다`)
    return { year, slug, sets, bundle: { catalog, rules } }
  })
  .sort((a, b) => (a.slug === b.slug ? a.year - b.year : a.slug.localeCompare(b.slug)))

for (const { year, slug, sets, bundle } of DATASETS) {
  const departments = new Set(Object.values(sets).map((s) => s.department))
  if (departments.size !== 1) {
    fail(
      `requirement-set-${year}-${slug}.json 의 과정들이 서로 다른 department 를 갖는다: ${[...departments].join(', ')}`,
    )
  }
  const department = [...departments][0]
  if (department != null) {
    ;(bundlesByDepartment[department] ??= {})[year] = bundle
  }

  for (const set of Object.values(sets)) {
    if (requirementSetRegistry[set.id]) fail(`요건 세트 id 중복: ${set.id}`)
    requirementSetRegistry[set.id] = set
    DATA_BUNDLES[set.id] = bundle
  }
}

// ── 조회 헬퍼 (index.ts 의 named export 재구성용) ────────────

function datasetOf(year: number, slug: string): Dataset {
  const found = DATASETS.find((d) => d.year === year && d.slug === slug)
  if (!found) fail(`데이터셋 없음: ${datasetKey(year, slug)}`)
  return found
}

/** 학과 카탈로그 조회(없으면 즉시 던짐). */
export function catalogOf(year: number, slug: string): CatalogEntry[] {
  return datasetOf(year, slug).bundle.catalog
}

/** 추가전공 규칙 조회(없으면 즉시 던짐). */
export function rulesOf(year: number, slug: string): AdditionalMajorRule[] {
  return datasetOf(year, slug).bundle.rules
}

/** 과정(track)별 요건 세트 조회(없으면 즉시 던짐). */
export function setOf(year: number, slug: string, track: string): RequirementSet {
  const set = datasetOf(year, slug).sets[track]
  if (!set) fail(`데이터셋 ${datasetKey(year, slug)} 에 과정 '${track}' 이 없다`)
  return set
}

/** 교양 카탈로그 조회(없으면 즉시 던짐). */
export function geCatalogOf(year: number): CatalogEntry[] {
  const catalog = geByYear.get(year)
  if (!catalog) fail(`교양 카탈로그 없음: catalog-${year}-ge.json`)
  return catalog
}
