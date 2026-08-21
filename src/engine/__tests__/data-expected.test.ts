/**
 * R5 — 요람 기대값 명세 비교기.
 *
 * data-src/expected/{학번}-{slug}.json 을 로드해
 * 생성된 요건 세트·카탈로그의 소계와 대조한다.
 * DATASETS 매니페스트를 순회하므로 신규 번들 추가 시 테스트 코드 0줄.
 *
 * ── 순환검증 방지 ──
 * 기대값이 산출물에서 역산된 것이면 이 테스트는 "산출물과 산출물이 같다"만 보증한다.
 * 그래서 명세는 `source.method`로 출처를 밝히고, 요람 판독본(`blind-yoram`)에는
 * 요람이 **따로 인쇄한 소계**(printedSubtotals)를 함께 싣는다. 소계는 개별 학점과
 * 독립적으로 인쇄된 숫자이므로, 개별 학점의 합이 소계와 맞는지 검사하면
 * 역산으로는 통과할 수 없는 산술 구속이 생긴다.
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

/** 기대값의 출처. `blind-yoram`만 "요람과 대조됨"을 뜻한다. */
type ExpectedMethod = 'blind-yoram' | 'derived-from-output'

interface PrintedSubtotal {
  /** 요람이 인쇄한 그룹명 (예: 대학필수) */
  label: string
  /** 괄호 안 소계 학점 */
  credits: number
  /** 소계 원문 (예: "(소계 : 20)") */
  raw?: string
  /** 이 소계에 묶이는 버킷 id */
  buckets: string[]
}

interface ExpectedSpec {
  description?: string
  source?: {
    document?: string
    section?: string
    method?: ExpectedMethod
    verifiedOn?: string | null
    note?: string
  }
  totalCredits: number
  minGPA: number
  buckets: Record<string, number>
  /** 요람 인쇄 소계 — blind-yoram 명세에만 있다 */
  printedSubtotals?: PrintedSubtotal[]
  /** 총학점 − 인쇄 소계 합 이 들어가는 버킷 */
  residualBucket?: string
  trackOverrides?: Record<string, Record<string, number>>
  /** 트랙별로 달라지는 소계 (예: 일반과정 전공 46) */
  trackSubtotals?: Record<string, Record<string, { credits: number; buckets: string[] }>>
  majorRequiredCount: number
  /** 요람이 나열한 전공필수 과목명 */
  majorRequiredCourses?: string[]
  /** 요람 인쇄값이 아닌 구조 회귀 방지용 카운트 */
  regressionOnly?: {
    note?: string
    catalogCount?: number
    choiceGroupCount?: number
    nonCurricularCount?: number
  }
  notes?: string[]
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

/** 과목명 비교용 정규화 — 요람 표기 흔들림(공백·중점·괄호·숫자)을 흡수한다. */
function normName(s: string): string {
  return s.replace(/[\s·및()0-9]/g, '')
}

// ── 테스트 케이스 빌드 ──────────────────────────────────────

const cases = DATASETS.map((d) => ({
  key: `${d.year}-${d.slug}`,
  ...d,
})).filter((c) => expectedMap.has(c.key))

if (cases.length === 0) {
  it.skip('기대값 파일이 없어 건너뜀', () => {})
} else {
  describe.each(cases)('기대값 대조 $key', ({ key, sets, bundle }) => {
    const spec = expectedMap.get(key)!
    const tracks = Object.entries(sets)
    /** 트렁크 = general이 아닌 첫 번째 트랙, 없으면 첫 트랙 */
    const trunk = (tracks.find(([t]) => t !== 'general') ?? tracks[0]!)[1]

    const creditsOf = (set: (typeof tracks)[number][1], id: string): number => {
      const bucket = set.buckets.find((b) => b.id === id)
      expect(bucket, `bucket '${id}' 존재`).toBeDefined()
      return bucket!.minCredits
    }

    // ── 출처 ──────────────────────────────────────────────
    // 기대값이 어디서 왔는지 파일이 스스로 밝히게 강제한다.
    // 이걸 비워두면 다음 사람이 산출물 역산본을 요람 대조본으로 오해한다.

    it('source.method 선언', () => {
      const method = spec.source?.method
      expect(method, `${key}: source.method 선언 필요`).toBeDefined()
      expect(['blind-yoram', 'derived-from-output']).toContain(method)
      if (method === 'blind-yoram') {
        expect(spec.source?.document, '요람 판독본은 원본 문서 경로 필요').toBeTruthy()
        expect(
          spec.printedSubtotals?.length,
          '요람 판독본은 인쇄 소계를 함께 실어야 한다(순환검증 차단)',
        ).toBeGreaterThan(0)
      }
    })

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
      for (const [id, expected] of Object.entries(spec.buckets)) {
        expect(creditsOf(trunk, id), `${id} minCredits`).toBe(expected)
      }
      // 기대값에 없는 버킷이 트렁크에 있으면 안 됨 (기대값이 전체를 커버해야 하므로)
      for (const b of trunk.buckets) {
        expect(spec.buckets[b.id], `트렁크 bucket '${b.id}'가 기대값에 있어야 함`).toBeDefined()
      }
    })

    // ── 요람 인쇄 소계와의 산술 대조 ──────────────────────
    // 요람은 개별 칸과 별개로 그룹 소계를 인쇄한다. 개별값 합 = 인쇄 소계 를
    // 검사하면, 산출물에서 역산한 기대값으로는 통과할 수 없다.

    if (spec.printedSubtotals?.length) {
      for (const sub of spec.printedSubtotals) {
        it(`요람 소계 '${sub.label}' = ${sub.credits} (트렁크)`, () => {
          const sum = sub.buckets.reduce((n, id) => n + creditsOf(trunk, id), 0)
          expect(sum, `${sub.buckets.join('+')} 합 vs 요람 인쇄 ${sub.raw ?? sub.credits}`).toBe(
            sub.credits,
          )
        })
      }

      if (spec.residualBucket) {
        const printedSum = spec.printedSubtotals.reduce((n, s) => n + s.credits, 0)
        const residual = spec.totalCredits - printedSum
        it(`잔여학점 '${spec.residualBucket}' = ${spec.totalCredits} − ${printedSum} = ${residual}`, () => {
          expect(creditsOf(trunk, spec.residualBucket!), '총학점 − 인쇄 소계 합').toBe(residual)
        })
      }
    }

    // ── 트랙 오버라이드 ───────────────────────────────────

    if (spec.trackOverrides) {
      for (const [track, overrides] of Object.entries(spec.trackOverrides)) {
        it(`트랙 '${track}' minCredits 차이 일치`, () => {
          const set = sets[track]
          expect(set, `track '${track}' 존재`).toBeDefined()
          for (const [id, expected] of Object.entries(overrides)) {
            expect(creditsOf(set!, id), `${track}.${id} minCredits`).toBe(expected)
          }
        })
      }
    }

    if (spec.trackSubtotals) {
      for (const [track, subs] of Object.entries(spec.trackSubtotals)) {
        for (const [label, sub] of Object.entries(subs)) {
          it(`트랙 '${track}' 요람 소계 '${label}' = ${sub.credits}`, () => {
            const set = sets[track]
            expect(set, `track '${track}' 존재`).toBeDefined()
            const sum = sub.buckets.reduce((n, id) => n + creditsOf(set!, id), 0)
            expect(sum, `${track}: ${sub.buckets.join('+')} 합`).toBe(sub.credits)
          })
        }
      }
    }

    // ── 전공필수 ──────────────────────────────────────────

    it(`majorRequiredCount = ${spec.majorRequiredCount}`, () => {
      const req = trunk.buckets.find((b) => b.id === 'major_required')
      expect(req?.requiredCourses?.length ?? 0, 'major_required.requiredCourses.length').toBe(
        spec.majorRequiredCount,
      )
    })

    // 개수만 맞고 과목이 다른 경우를 잡는다. courseKey → 카탈로그 과목명으로 풀어
    // 요람이 나열한 이름과 집합 비교한다(표기 흔들림은 normName이 흡수).
    if (spec.majorRequiredCourses?.length) {
      it('전공필수 과목이 요람 목록과 일치', () => {
        const byKey = new Map(bundle.catalog.map((c) => [c.courseKey, c.name]))
        const req = trunk.buckets.find((b) => b.id === 'major_required')
        const ours = new Set(
          (req?.requiredCourses ?? []).map((k) => normName(byKey.get(k) ?? `?${k}`)),
        )
        const theirs = new Set(spec.majorRequiredCourses!.map(normName))
        const missing = [...theirs].filter((n) => !ours.has(n))
        const extra = [...ours].filter((n) => !theirs.has(n))
        expect(missing, '요람에 있는데 세트에 없는 전공필수').toEqual([])
        expect(extra, '세트에 있는데 요람에 없는 전공필수').toEqual([])
      })
    }

    // ── 구조 카운트 (요람 대조 아님 — 회귀 방지용) ────────

    const reg = spec.regressionOnly
    if (reg?.catalogCount != null) {
      it(`[회귀] catalogCount = ${reg.catalogCount}`, () => {
        expect(bundle.catalog.length, '학과 카탈로그 과목 수').toBe(reg.catalogCount)
      })
    }

    if (reg?.choiceGroupCount != null) {
      it(`[회귀] choiceGroupCount = ${reg.choiceGroupCount}`, () => {
        const count = trunk.buckets.reduce((sum, b) => sum + (b.choiceGroups?.length ?? 0), 0)
        expect(count, '택1 그룹 수').toBe(reg.choiceGroupCount)
      })
    }

    if (reg?.nonCurricularCount != null) {
      it(`[회귀] nonCurricularCount = ${reg.nonCurricularCount}`, () => {
        expect(trunk.nonCurricular.length, '비교과 항목 수').toBe(reg.nonCurricularCount)
      })
    }
  })
}
