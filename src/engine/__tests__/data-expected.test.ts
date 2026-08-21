/**
 * R5 — 요람 기대값 명세 비교기.
 *
 * data-src/expected/{학번}-{slug}.json 을 로드해
 * 생성된 요건 세트·카탈로그의 소계와 대조한다.
 * DATASETS 매니페스트를 순회하므로 신규 번들 추가 시 테스트 코드 0줄.
 *
 * 테스트 환경이 node이므로 fs.readFileSync로 기대값을 읽는다.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { DATASETS } from '../../data/index.js'

// ── 기대값 파일 로드 ────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const EXPECTED_DIR = resolve(__dirname, '../../../data-src/expected')

interface ExpectedSpec {
  description?: string
  totalCredits: number
  minGPA: number
  buckets: Record<string, number>
  trackOverrides?: Record<string, Record<string, number>>
  majorRequiredCount: number
  catalogCount: number
  choiceGroupCount?: number
  nonCurricularCount?: number
}

function loadExpected(): Map<string, ExpectedSpec> {
  const map = new Map<string, ExpectedSpec>()
  let files: string[]
  try {
    files = readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return map // 디렉토리 없으면 빈 맵
  }
  for (const f of files) {
    const key = f.replace(/\.json$/, '')
    const raw = readFileSync(join(EXPECTED_DIR, f), 'utf8')
    map.set(key, JSON.parse(raw) as ExpectedSpec)
  }
  return map
}

const expectedMap = loadExpected()

// ── 테스트 케이스 빌드 ──────────────────────────────────────

const cases = DATASETS.map((d) => ({
  key: `${d.year}-${d.slug}`,
  ...d,
})).filter((c) => expectedMap.has(c.key))

if (cases.length === 0) {
  it.skip('기대값 파일이 없어 건너뜀', () => {})
} else {
  describe.each(cases)('기대값 대조 $key', ({ key, year, slug, sets, bundle }) => {
    const spec = expectedMap.get(key)!
    const tracks = Object.entries(sets)

    // ── 전역 값 ───────────────────────────────────────────

    it(`totalCredits = ${spec.totalCredits}`, () => {
      for (const [track, set] of tracks) {
        expect(set.totalCredits, `${key}/${track} totalCredits`).toBe(spec.totalCredits)
      }
    })

    it(`minGPA = ${spec.minGPA}`, () => {
      for (const [track, set] of tracks) {
        expect(set.minGPA, `${key}/${track} minGPA`).toBe(spec.minGPA)
      }
    })

    // ── 트렁크 버킷 minCredits ────────────────────────────

    it('트렁크 버킷별 minCredits 일치', () => {
      // 트렁크 = general이 아닌 첫 번째 트랙, 없으면 첫 트랙
      const trunkPair = tracks.find(([t]) => t !== 'general') ?? tracks[0]!
      const trunk = trunkPair[1]
      for (const [id, expected] of Object.entries(spec.buckets)) {
        const bucket = trunk.buckets.find((b) => b.id === id)
        expect(bucket, `트렁크에 bucket '${id}' 존재`).toBeDefined()
        expect(bucket!.minCredits, `${id} minCredits`).toBe(expected)
      }
      // 기대값에 없는 버킷이 트렁크에 있으면 안 됨 (기대값이 전체를 커버해야 하므로)
      for (const b of trunk.buckets) {
        expect(
          spec.buckets[b.id],
          `트렁크 bucket '${b.id}'가 기대값에 있어야 함`,
        ).toBeDefined()
      }
    })

    // ── 트랙 오버라이드 ───────────────────────────────────

    if (spec.trackOverrides) {
      for (const [track, overrides] of Object.entries(spec.trackOverrides)) {
        it(`트랙 '${track}' minCredits 차이 일치`, () => {
          const set = sets[track]
          expect(set, `track '${track}' 존재`).toBeDefined()
          for (const [id, expected] of Object.entries(overrides)) {
            const bucket = set!.buckets.find((b) => b.id === id)
            expect(bucket, `${track}에 bucket '${id}' 존재`).toBeDefined()
            expect(bucket!.minCredits, `${track}.${id} minCredits`).toBe(expected)
          }
        })
      }
    }

    // ── 구조 카운트 ───────────────────────────────────────

    it(`majorRequiredCount = ${spec.majorRequiredCount}`, () => {
      const trunkPair = tracks.find(([t]) => t !== 'general') ?? tracks[0]!
      const trunk = trunkPair[1]
      const req = trunk.buckets.find((b) => b.id === 'major_required')
      const count = req?.requiredCourses?.length ?? 0
      expect(count, 'major_required.requiredCourses.length').toBe(spec.majorRequiredCount)
    })

    it(`catalogCount = ${spec.catalogCount}`, () => {
      expect(bundle.catalog.length, '학과 카탈로그 과목 수').toBe(spec.catalogCount)
    })

    if (spec.choiceGroupCount != null) {
      it(`choiceGroupCount = ${spec.choiceGroupCount}`, () => {
        const trunkPair = tracks.find(([t]) => t !== 'general') ?? tracks[0]!
        const trunk = trunkPair[1]
        const count = trunk.buckets.reduce(
          (sum: number, b) => sum + (b.choiceGroups?.length ?? 0),
          0,
        )
        expect(count, '택1 그룹 수').toBe(spec.choiceGroupCount)
      })
    }

    if (spec.nonCurricularCount != null) {
      it(`nonCurricularCount = ${spec.nonCurricularCount}`, () => {
        const trunkPair = tracks.find(([t]) => t !== 'general') ?? tracks[0]!
        const trunk = trunkPair[1]
        expect(trunk.nonCurricular.length, '비교과 항목 수').toBe(spec.nonCurricularCount)
      })
    }
  })
}
