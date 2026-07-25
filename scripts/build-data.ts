/**
 * R4 상속(패치) 모델 — 빌더 (`data:build` / `data:check`).
 *
 * 사람이 편집하는 소스(`data-src/`)를 앱이 읽는 런타임 산출물(`src/data/*.json`)로
 * 합성한다. 런타임 포맷·엔진·앱·스토리지는 전혀 바뀌지 않는다 — 병합은 빌드 타임 전용이다.
 *
 *   node scripts/build-data.ts           # 산출물 생성(덮어쓰기)
 *   node scripts/build-data.ts --check    # 재생성 결과 = 커밋본 인지 바이트 대조(수정 없음)
 *
 * Node ≥ 22.18(무플래그 TS 타입스트립) 필요 — package.json engines·.nvmrc 참조.
 *
 * 소스 레이아웃(파일명 규약):
 *   data-src/{slug}/meta.json                     { slug, years[], tracks[], trunk }  또는 { slug, years[], kind:"catalog-only" }
 *   data-src/{slug}/set-base.json                 트렁크 트랙 완전본(첫 학번). $include 마커 허용
 *   data-src/{slug}/set-{year}.patch.json         { trunk?: Patch, tracks?: { <track>: Patch } }  (첫 학번은 trunk 생략 — 두면 에러)
 *   data-src/{slug}/catalog-base.json             학과 카탈로그 완전본(첫 학번)
 *   data-src/{slug}/catalog-{year}.patch.json     그 해 카탈로그 델타 (무변경 연도는 파일 생략 가능)
 *   data-src/{slug}/amr-base.json                 추가전공 규칙 완전본(첫 학번)
 *   data-src/{slug}/amr-{year}.patch.json         그 해 규칙 델타 (무변경 연도는 파일 생략 가능)
 *   data-src/ge/catalog-{year}.json               다산 교양 카탈로그(완전본·연도별, note 드리프트로 패치 무의미)
 *   data-src/{slug}/buckets-{year}.json           교양 공통 버킷 조각($include 대상, 산출물 아님)
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyPatch, expandIncludes } from './lib/merge.ts'
import { serializeFile } from './lib/serialize.ts'
import { isPlainObject, type Json, type JsonObject } from './lib/jsonutil.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data-src')
const OUT = join(ROOT, 'src', 'data')

interface Meta {
  slug: string
  years: number[]
  tracks?: string[]
  trunk?: string
  kind?: 'catalog-only'
}

interface Output {
  file: string // basename, 예: catalog-2021-sw.json
  value: Json
  text: string // serializeFile(value)
}

/** 빌드 결과 + 실제로 소비한 소스 파일(고아 소스 감지용). */
export interface BuildResult {
  outputs: Output[]
  /** 빌드가 읽은 소스 파일의 data-src 상대경로(예: 'sw/set-2022.patch.json'). */
  sources: Set<string>
}

/** canonical 정수(array-index) 문자열 키. JS 가 오름차순으로 재정렬해 소스 순서가 유실된다. */
const INTEGER_KEY = /^(?:0|[1-9]\d*)$/

/**
 * 산출물 무결성: 완전본에는 예약 토큰·정수형 키가 없어야 한다.
 *  • `$`-접두 객체 키(디렉티브 잔재·미해소 $include)나 '$delete' 문자열 값이 남으면
 *    앞으로 그 값에서 역차분(diff)할 때 디렉티브와 구분되지 않는다.
 *  • 정수형(array-index) 객체 키는 JS `[[OwnPropertyKeys]]`·`JSON.parse` 규칙상 오름차순으로
 *    재정렬돼 소스 순서를 보장할 수 없다(serialize.ts 참조) — 산출물에 들어오지 못하게 막는다.
 * 빌드 단계에서 즉시 던진다.
 */
function assertNoReservedTokens(value: Json, file: string, path = ''): void {
  if (Array.isArray(value)) {
    value.forEach((el, i) => assertNoReservedTokens(el, file, `${path}[${i}]`))
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      if (k.startsWith('$')) throw new Error(`${file}: 산출물에 예약 키 '${k}' 잔존 (${path})`)
      if (INTEGER_KEY.test(k)) {
        throw new Error(`${file}: 산출물에 정수형 키 '${k}' — JS 가 순서를 재정렬하므로 금지 (${path})`)
      }
      assertNoReservedTokens(value[k]!, file, `${path}.${k}`)
    }
  } else if (value === '$delete') {
    throw new Error(`${file}: 산출물 값이 예약 센티널 '$delete' 와 충돌 (${path})`)
  }
}

const relPath = (slug: string, file: string) => `${slug}/${file}`
const absPath = (slug: string, file: string) => join(SRC, slug, file)
const readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8')) as Json

const listDir = (slug: string): string[] => {
  try {
    return readdirSync(join(SRC, slug))
  } catch {
    return []
  }
}

interface ErrnoException extends Error {
  code?: string
}
const isEnoent = (e: unknown): boolean => (e as ErrnoException)?.code === 'ENOENT'

/** data-src 전체를 열거해 산출물과 소비 소스를 만든다(순수: 파일시스템 읽기만, 쓰기 없음). */
export function buildAll(): BuildResult {
  const slugs = readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  const sources = new Set<string>()
  /** 소스 파일 읽기 + 소비 기록. 없으면 던진다. */
  const readSrc = (slug: string, file: string): Json => {
    sources.add(relPath(slug, file))
    return readJson(absPath(slug, file))
  }
  /** 선택적 패치 읽기: 없으면 no-op({}). 무변경 연도는 파일을 만들 필요가 없다. */
  const readOptionalPatch = (slug: string, file: string): Json => {
    try {
      const v = readJson(absPath(slug, file))
      sources.add(relPath(slug, file))
      return v
    } catch (e) {
      if (isEnoent(e)) return {}
      throw e
    }
  }

  // ── $include 조각 레지스트리: 전 학과의 buckets-{year}.json → "{slug}/buckets-{year}" ──
  const registry: Record<string, Json[]> = {}
  for (const slug of slugs) {
    for (const f of listDir(slug)) {
      const m = /^buckets-(\d{4})\.json$/.exec(f)
      if (!m) continue
      const frag = readJson(absPath(slug, f))
      if (!Array.isArray(frag)) throw new Error(`조각은 배열이어야 한다: ${slug}/${f}`)
      registry[`${slug}/buckets-${m[1]}`] = frag
    }
  }
  const usedFragments = new Set<string>()
  const expand = (v: Json): Json => expandIncludes(v, registry, [], usedFragments)

  const outputs: Output[] = []
  const emit = (file: string, value: Json) => {
    assertNoReservedTokens(value, file)
    outputs.push({ file, value, text: serializeFile(value) })
  }

  for (const slug of slugs) {
    const meta = readSrc(slug, 'meta.json') as unknown as Meta
    if (meta.slug !== slug) throw new Error(`meta.slug '${meta.slug}' ≠ 폴더명 '${slug}'`)
    const years = [...meta.years].sort((a, b) => a - b)
    const baseYear = years[0]!

    if (meta.kind === 'catalog-only') {
      // 교양: 완전본 카탈로그를 연도별로 그대로 방출(passthrough).
      for (const y of years) emit(`catalog-${y}-${slug}.json`, expand(readSrc(slug, `catalog-${y}.json`)))
      continue
    }

    const tracks = meta.tracks ?? []
    const trunk = meta.trunk
    if (tracks.length === 0 || !trunk || !tracks.includes(trunk)) {
      throw new Error(`${slug}/meta.json: tracks·trunk 구성 오류`)
    }
    const others = tracks.filter((t) => t !== trunk)

    // ── 카탈로그·AMR: base + 연도 패치 체인(무변경 연도는 패치 파일 생략 가능) ──
    const chain = (kind: 'catalog' | 'amr'): Record<number, Json> => {
      const out: Record<number, Json> = {}
      let prev = expand(readSrc(slug, `${kind}-base.json`))
      for (const y of years) {
        prev = y === baseYear ? prev : applyPatch(prev, expand(readOptionalPatch(slug, `${kind}-${y}.patch.json`)))
        out[y] = prev
      }
      return out
    }
    const catByYear = chain('catalog')
    const amrByYear = chain('amr')
    for (const y of years) {
      emit(`catalog-${y}-${slug}.json`, catByYear[y]!)
      emit(`additional-major-rules-${y}-${slug}.json`, amrByYear[y]!)
    }

    // ── 세트: 트렁크 lineage + 연도별 트랙 패치 ──
    let trunkPrev = expand(readSrc(slug, 'set-base.json'))
    for (const y of years) {
      const patch = readSrc(slug, `set-${y}.patch.json`) as JsonObject
      if (y === baseYear && patch['trunk'] !== undefined) {
        throw new Error(
          `${slug}/set-${y}.patch.json: 베이스 학번 패치에는 trunk 를 둘 수 없다 — 트렁크 완전본은 set-base.json 에서 편집할 것`,
        )
      }
      const trunkCur =
        y === baseYear ? trunkPrev : applyPatch(trunkPrev, expand((patch['trunk'] as Json) ?? {}))
      const setObj: JsonObject = {}
      for (const t of tracks) {
        if (t === trunk) {
          setObj[t] = trunkCur
        } else {
          const tp = isPlainObject(patch['tracks']) ? (patch['tracks'] as JsonObject)[t] : undefined
          if (tp === undefined) throw new Error(`${slug}/set-${y}.patch.json: 트랙 '${t}' 패치 없음`)
          setObj[t] = applyPatch(trunkCur, expand(tp))
        }
      }
      emit(`requirement-set-${y}-${slug}.json`, setObj)
      trunkPrev = trunkCur
    }
  }

  // 소비된 $include 조각을 소스 목록에 반영(미참조 조각을 고아로 잡기 위해).
  for (const name of usedFragments) sources.add(`${name}.json`)

  outputs.sort((a, b) => a.file.localeCompare(b.file))
  return { outputs, sources }
}

/** 산출물만 반환(테스트·기존 소비처 호환). */
export function buildOutputs(): Output[] {
  return buildAll().outputs
}

/** data-src 안의 전 .json 상대경로(고아 소스 대조용). */
export function listSourceFiles(): string[] {
  const out: string[] = []
  for (const d of readdirSync(SRC, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    for (const f of listDir(d.name)) if (f.endsWith('.json')) out.push(relPath(d.name, f))
  }
  return out.sort()
}

/** 빌드가 읽지 않은 소스(죽은 패치·미참조 $include 조각). */
export function orphanSources(result: BuildResult): string[] {
  return listSourceFiles().filter((rel) => !result.sources.has(rel))
}

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

function runBuild(): void {
  const { outputs, sources } = buildAll()
  for (const o of outputs) writeFileSync(join(OUT, o.file), o.text)
  const orphans = orphanSources({ outputs, sources })
  if (orphans.length > 0) {
    console.warn(`[data:build] 경고 — 빌드가 읽지 않은 소스(죽은 패치·미참조 조각):\n  ${orphans.join('\n  ')}`)
  }
  console.log(`[data:build] ${outputs.length}개 산출물 생성 → src/data/`)
}

function runCheck(): void {
  const result = buildAll()
  const { outputs } = result
  const mismatches: string[] = []
  const expectedFiles = new Set(outputs.map((o) => o.file))
  for (const o of outputs) {
    let current: string
    try {
      current = readFileSync(join(OUT, o.file), 'utf8')
    } catch {
      mismatches.push(`${o.file}: 커밋본 없음(빌드가 새로 만듦)`)
      continue
    }
    if (current !== o.text) mismatches.push(`${o.file}: 바이트 불일치`)
  }
  // 산출물 고아: src/data 에 있으나 대응 소스가 없는 .json.
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.json') && !expectedFiles.has(f)) mismatches.push(`src/data/${f}: 대응 소스 없음(고아 산출물)`)
  }
  // 소스 고아: data-src 에 있으나 빌드가 읽지 않은 .json(죽은 패치·미참조 $include 조각).
  for (const rel of orphanSources(result)) mismatches.push(`data-src/${rel}: 빌드가 읽지 않음(죽은 패치·미참조 조각)`)

  if (mismatches.length > 0) {
    console.error(`[data:check] 실패 — 재생성 결과가 커밋본과 다르다:\n  ${mismatches.join('\n  ')}`)
    console.error(`\n소스(data-src/)를 고쳤으면 \`npm run data:build\` 로 산출물을 갱신하고 커밋할 것.`)
    process.exit(1)
  }
  console.log(`[data:check] OK — ${outputs.length}개 산출물이 커밋본과 바이트 동일`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.argv.includes('--check')) runCheck()
  else runBuild()
}
