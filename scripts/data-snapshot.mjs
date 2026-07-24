/**
 * 데이터 산출물 스냅샷 해시 생성기 (R0).
 *
 * src/data/*.json 전체의 정규화 해시(키 정렬 stringify → sha256)를
 * src/engine/__tests__/data-snapshot.test.ts 의 EXPECTED_HASHES 블록 형태로 출력한다.
 *
 * 데이터 산출물이 바뀌는 커밋은 이 스크립트 출력으로 EXPECTED_HASHES를 갱신해야 한다:
 *   node scripts/data-snapshot.mjs
 *
 * 정규화 규칙(테스트와 동일해야 한다 — 다르면 해시 불일치로 테스트가 실패한다):
 *   배열은 순서 유지, 객체는 키를 정렬해 직렬화한다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

/** 키 정렬 결정론 직렬화. JSON 값만 다룬다(undefined·함수 없음). */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const files = readdirSync(dataDir)
  .filter((f) => f.endsWith('.json'))
  .sort()

console.log('const EXPECTED_HASHES: Record<string, string> = {')
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(dataDir, file), 'utf8'))
  const hash = createHash('sha256').update(stableStringify(parsed)).digest('hex')
  console.log(`  '${file}': '${hash}',`)
}
console.log('}')
