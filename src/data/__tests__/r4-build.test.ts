/**
 * R4 상속(패치) 모델 — 재생성 = 커밋본 게이트 (CI 강제).
 *
 * `data-src/` 를 빌드한 결과가 커밋된 `src/data/*.json` 과 바이트 동일한지 검사한다.
 * 즉 (1) 산출물 JSON 을 손으로 고치면(소스 미반영) 실패하고, (2) 소스를 고치고
 * `npm run data:build` 를 안 돌리면 실패한다. `npm run data:check` 와 같은 게이트를
 * 테스트 스위트 안에서도 강제해, 개편 기간의 소스/산출물 드리프트를 상시 차단한다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { buildAll, orphanSources } from '../../../scripts/build-data.ts'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = buildAll()
const outputs = result.outputs

describe('R4 재생성 게이트', () => {
  it('산출물 파일 집합이 src/data 의 JSON 과 정확히 일치한다', () => {
    const built = outputs.map((o) => o.file).sort()
    const committed = readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
    expect(built).toEqual(committed)
  })

  it('data-src 에 고아 소스가 없다(죽은 패치·미참조 $include 조각)', () => {
    // backport 가 $include 를 인라인으로 되돌리거나 meta.years 밖 패치가 남으면 여기서 잡힌다.
    expect(orphanSources(result)).toEqual([])
  })

  it.each(outputs.map((o) => [o.file, o] as const))('%s — 재생성 바이트 동일', (_file, o) => {
    const current = readFileSync(join(OUT_DIR, o.file), 'utf8')
    expect(
      current === o.text,
      `${o.file}: 재생성 결과가 커밋본과 다르다. 소스(data-src/)를 고쳤으면 \`npm run data:build\`, 산출물을 손으로 고쳤으면 되돌릴 것.`,
    ).toBe(true)
  })
})
