/**
 * R4 상속(패치) 모델 — 역이식 생성기 (1회성 도구, 재현용으로 보존).
 *
 * 기존 커밋본(`src/data/*.json`)에서 소스 조각(`data-src/`)을 자동 역차분한다.
 * 손으로 패치를 쓰지 않으므로 라운드트립이 구조적으로 보장된다(diff 는 applyPatch 의 역).
 * 마지막에 buildOutputs() 를 돌려 재생성 값이 커밋본과 파싱 동일한지 자체 검증한다.
 *
 *   node scripts/backport.ts
 *
 * 그 뒤 `npm run data:build` 로 산출물을 정규 포맷으로 1회 재작성하면
 * 이후부터 `npm run data:check` 가 바이트 동일 게이트로 작동한다.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyPatch } from './lib/merge.ts'
import { diffValue } from './lib/diff.ts'
import { serializeFile } from './lib/serialize.ts'
import { deepEqual, type Json, type JsonObject } from './lib/jsonutil.ts'
import { buildOutputs } from './build-data.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data-src')
const DATA = join(ROOT, 'src', 'data')

const load = (f: string): Json => JSON.parse(readFileSync(join(DATA, f), 'utf8'))
function writeSrc(slug: string, file: string, value: Json): void {
  mkdirSync(join(SRC, slug), { recursive: true })
  writeFileSync(join(SRC, slug, file), serializeFile(value))
}

interface Dept {
  slug: string
  college: string
  department: string
  years: number[]
  tracks: string[]
  trunk: string
}

const DEPTS: Dept[] = [
  {
    slug: 'sw',
    college: '소프트웨어융합대학',
    department: '소프트웨어학과',
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    tracks: ['advanced', 'general'],
    trunk: 'advanced',
  },
  {
    slug: 'me',
    college: '공과대학',
    department: '기계공학과',
    years: [2021, 2022],
    tracks: ['accredited', 'general'],
    trunk: 'accredited',
  },
]

const GE_YEARS = [2021, 2022, 2023, 2024, 2025, 2026]

function backportDept(d: Dept): void {
  const { slug, years, tracks, trunk } = d
  const baseYear = years[0]!
  const others = tracks.filter((t) => t !== trunk)

  writeSrc(slug, 'meta.json', {
    slug,
    college: d.college,
    department: d.department,
    years,
    tracks,
    trunk,
  })

  // ── 세트: 트렁크 lineage + 연도별 트랙 패치 ──
  const sets = years.map((y) => load(`requirement-set-${y}-${slug}.json`) as JsonObject)
  writeSrc(slug, 'set-base.json', sets[0]![trunk]!)
  let trunkPrev = sets[0]![trunk]!
  years.forEach((y, i) => {
    const patch: JsonObject = {}
    let trunkCur = trunkPrev
    if (y !== baseYear) {
      const t = diffValue(trunkPrev, sets[i]![trunk]!) ?? {}
      patch['trunk'] = t
      trunkCur = applyPatch(trunkPrev, t)
    }
    const tracksPatch: JsonObject = {}
    for (const o of others) tracksPatch[o] = diffValue(trunkCur, sets[i]![o]!) ?? {}
    patch['tracks'] = tracksPatch
    writeSrc(slug, `set-${y}.patch.json`, patch)
    trunkPrev = trunkCur
  })

  // ── 카탈로그·AMR: base + 연도 패치 ──
  for (const [kind, fileOf] of [
    ['catalog', (y: number) => `catalog-${y}-${slug}.json`],
    ['amr', (y: number) => `additional-major-rules-${y}-${slug}.json`],
  ] as const) {
    const series = years.map((y) => load(fileOf(y)))
    writeSrc(slug, `${kind}-base.json`, series[0]!)
    let prev = series[0]!
    years.forEach((y, i) => {
      if (y === baseYear) return
      writeSrc(slug, `${kind}-${y}.patch.json`, diffValue(prev, series[i]!) ?? {})
      prev = series[i]!
    })
  }
}

function backportGe(): void {
  writeSrc('ge', 'meta.json', { slug: 'ge', years: GE_YEARS, kind: 'catalog-only' })
  for (const y of GE_YEARS) writeSrc('ge', `catalog-${y}.json`, load(`catalog-${y}-ge.json`))
}

// ── 재실행 가드 ──
// backport 는 set-base.json 을 커밋 산출물(=$include 가 이미 전개된 완전본)로 덮어쓴다.
// 손으로 넣은 $include·조각 리팩터를 조용히 되돌리므로(멱등 아님), 기존 data-src 가 있으면
// --force 없이는 멈춘다. 최초 생성·의도적 재생성에만 --force 로 실행할 것.
const HAS_EXISTING = DEPTS.some(
  (d) => existsSync(join(SRC, d.slug)) && readdirSync(join(SRC, d.slug)).some((f) => f.endsWith('.json')),
)
if (HAS_EXISTING && !process.argv.includes('--force')) {
  console.error(
    'data-src/ 에 기존 소스가 있다. backport 는 set-base.json 등을 커밋 산출물로 덮어써 ' +
      '$include 등 수기 리팩터를 되돌린다(멱등 아님). 의도한 재생성이면 `--force` 로 실행할 것.',
  )
  process.exit(1)
}

// ── 실행 + 자체 검증(파싱 동일) ──
for (const d of DEPTS) backportDept(d)
backportGe()

const committed = new Map<string, Json>()
for (const d of DEPTS) {
  for (const y of d.years) {
    committed.set(`requirement-set-${y}-${d.slug}.json`, load(`requirement-set-${y}-${d.slug}.json`))
    committed.set(`catalog-${y}-${d.slug}.json`, load(`catalog-${y}-${d.slug}.json`))
    committed.set(`additional-major-rules-${y}-${d.slug}.json`, load(`additional-major-rules-${y}-${d.slug}.json`))
  }
}
for (const y of GE_YEARS) committed.set(`catalog-${y}-ge.json`, load(`catalog-${y}-ge.json`))

let fail = 0
const built = buildOutputs()
const builtFiles = new Set(built.map((o) => o.file))
for (const o of built) {
  const c = committed.get(o.file)
  if (c === undefined) { console.log(`  ✗ 커밋본에 없는 산출물: ${o.file}`); fail++; continue }
  if (!deepEqual(o.value, c)) { console.log(`  ✗ 파싱 불일치: ${o.file}`); fail++ }
}
for (const f of committed.keys()) if (!builtFiles.has(f)) { console.log(`  ✗ 재생성 누락: ${f}`); fail++ }

console.log(
  fail === 0
    ? `\n✅ 역이식 완료 — ${built.length}개 산출물이 커밋본과 파싱 동일. 이제 \`npm run data:build\` 로 정규 포맷 재작성.`
    : `\n❌ ${fail}건 불일치 — 역이식/병합기 점검 필요`,
)
process.exit(fail === 0 ? 0 : 1)
