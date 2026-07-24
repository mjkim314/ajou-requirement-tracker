/**
 * R0 — 데이터 산출물 스냅샷 고정.
 *
 * 등록된 전 번들(요건 세트·카탈로그·추가전공 규칙·교양 카탈로그)의 정규화 해시를
 * 고정 목록과 대조한다. 개편 기간 동안 데이터 산출물의 의도치 않은 변화를 기계적으로
 * 차단하는 안전망이다(TASKS.md R0).
 *
 * 데이터가 바뀌는 커밋은 반드시 이 목록의 갱신을 함께 포함해야 한다:
 *   node scripts/data-snapshot.mjs   ← EXPECTED_HASHES 블록을 출력한다
 *
 * 파일 열거는 import.meta.glob이라 새 JSON을 추가하고 목록을 안 고쳐도,
 * 파일을 지우고 목록을 안 고쳐도 실패한다(양방향 드리프트 감지).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const UPDATE_HINT =
  '데이터 산출물이 바뀌었으면 `node scripts/data-snapshot.mjs` 출력으로 EXPECTED_HASHES를 갱신해 커밋에 포함할 것.'

/** 키 정렬 결정론 직렬화 — scripts/data-snapshot.mjs 와 동일한 규칙. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

/** src/data 의 전체 JSON 산출물. eager라 번들 동작과 동일하게 파싱된 값을 해시한다. */
const dataModules = import.meta.glob('../../data/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const actualByFile = new Map<string, unknown>(
  Object.entries(dataModules).map(([path, parsed]) => [path.split('/').pop()!, parsed]),
)

// `node scripts/data-snapshot.mjs` 출력 (2026-07-24, 8묶음 + GE 6종 = 30파일)
const EXPECTED_HASHES: Record<string, string> = {
  'additional-major-rules-2021-me.json': '661b17bf9700b0069a3fc32112bfb8b3a70c70e07f276dcc4dbe4ff8f56cee3d',
  'additional-major-rules-2021-sw.json': '94205776b390869038ff06030d654ef73347674f4110d830bd39b15ff889c8c2',
  'additional-major-rules-2022-me.json': 'ce0d9abd6f85f4e012fd36f3b447a902d6237cedf9827bc8777ea4c7102a49a8',
  'additional-major-rules-2022-sw.json': 'e32a500a780bfd231b8ec84b90f2671551560bf30d381c5f37defc8c561cdcd7',
  'additional-major-rules-2023-sw.json': '65e4e99d94c8eb5ba29fae55f9031e390403df20a5824dbeef9dd7013f2e5f75',
  'additional-major-rules-2024-sw.json': '95f587a0b53b812f6093edc7416f01d46f383f35afde430f5c368f7661e25e88',
  'additional-major-rules-2025-sw.json': '8e9caabd874c416ac3ab5d97171b257b23a5262f1f7e32ee235e8c80a4fb9472',
  'additional-major-rules-2026-sw.json': 'e751b33ff710dd4c6a4814df4d3c01683c8ce84ffae3e2ff6fa2203c4e0724ae',
  'catalog-2021-ge.json': '16b0fedce94ccd6d65abaadc358de8ae6e5d8b7cacbc8028b8c8cdf86f51d979',
  'catalog-2021-me.json': '90a91a4d97eece0a760d7dc0a8761cf6c9366a344ee050dec7caca6aea84bb08',
  'catalog-2021-sw.json': '91ea687b4cc670bbfe6c7f3b663e9c009cfe9867515650dd23508a62e566dbd3',
  'catalog-2022-ge.json': 'ef7e249b399ff96a5c6ad2e05dca53fcc761d89575f625c815dc249da50d4ac0',
  'catalog-2022-me.json': '926f400f72a2434912b498fa1238e4c46e2b1dd2a95626e43f8c7591c700188e',
  'catalog-2022-sw.json': '289f798cc72487568b1d6fb4d4cf070ff2587df04a320ae4b52acd1e8620fec5',
  'catalog-2023-ge.json': '4b3b8cb750488a7b0b165a1af6e8a6383275ff013fb22f94185788ca41f43304',
  'catalog-2023-sw.json': 'ea3ded59f58c7a15a1c7463e0b8d6d7aceb83981e8de0e7dbac03f80bf123dcf',
  'catalog-2024-ge.json': '621f2bac74ccbdf08d46376dcc06eb3ed9aa20dc3b3516a7c75b4e01617ffbb4',
  'catalog-2024-sw.json': '334e528a016d78f927422b176bca5f0a9d9d8afadd296d65c06d0c37fc585637',
  'catalog-2025-ge.json': '75e821721d976d9a8c6e34b00efa20f4c1a2019a9d5fddfd843f59b4b0c1f96c',
  'catalog-2025-sw.json': '844456a47d3ce9b655f6adff6faef74c5149878c3e651ee8ced70d4be8f7f68c',
  'catalog-2026-ge.json': '56bf1e2e40256691610c85b684d387e5fba40560e52cd53222b339ee3735ab95',
  'catalog-2026-sw.json': 'b6b517b1f1e7f43cd90165b5676dfa86bc194c03f498a65adfd79b6cea10d5b1',
  'requirement-set-2021-me.json': 'f5a597ba9b1405aa2ab0a3c55271bd08b9d2d290e3064c11efeb952bc0cd0614',
  'requirement-set-2021-sw.json': '035fda13160fced590f17ef5f462a7f2a96a11e56b5e0a0a076bf6bf956943ed',
  'requirement-set-2022-me.json': 'ada435de41f3e0bdf09221de5d0aeb3ccf44277e85a5aeb70e5e409c982de119',
  'requirement-set-2022-sw.json': '35b8e6d7d16163bf580af710ba3c1ae8c589dabc5039b3f7475768983b1e5fa1',
  'requirement-set-2023-sw.json': '80f79908561caf8ba9f44d199a129fd4e34b48fd03e875565c257224ff829dee',
  'requirement-set-2024-sw.json': '8cf1e6d0378717f1aa5e1f885d8c11cc1a4123bbf86fca691a24bb8417ea015f',
  'requirement-set-2025-sw.json': 'f6254ae644459a8cf4de38e4a1d1074787c1e784fb157be013f80422c97433ed',
  'requirement-set-2026-sw.json': '2e894830c2df7c82b3b8ad8324a3f2f4312ef1cef648daeb5b968e85a67c8458',
}

describe('R0 데이터 산출물 스냅샷', () => {
  it(`파일 집합이 고정 목록과 일치한다 — ${UPDATE_HINT}`, () => {
    expect([...actualByFile.keys()].sort()).toEqual(Object.keys(EXPECTED_HASHES).sort())
  })

  it.each([...actualByFile.keys()].sort().map((file) => [file] as const))(
    '%s 해시 일치',
    (file) => {
      expect(EXPECTED_HASHES[file], `${file}: 고정 목록에 없는 파일. ${UPDATE_HINT}`).toBeDefined()
      expect(sha256(actualByFile.get(file)), `${file} 내용 변경 감지. ${UPDATE_HINT}`).toBe(
        EXPECTED_HASHES[file],
      )
    },
  )
})
