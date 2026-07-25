/**
 * R4 상속(패치) 모델 — 정규 직렬화기 (순수·결정론).
 *
 * 빌드 산출물(`src/data/*.json`)의 바이트 표현을 한 규칙으로 고정한다. 이 규칙으로
 * 커밋본을 1회 재포맷한 뒤부터 `data:check` 가 "재생성 = 커밋본" 을 바이트 단위로 요구한다.
 *
 * 규칙(콤팩트-리프):
 *  • 값의 콤팩트(단일 줄) 표현이 현재 열 위치에서 WIDTH 이하면 그대로 한 줄에 쓴다.
 *  • 넘치면 펼친다(들여쓰기 2칸). 펼칠 때도 각 자식은 다시 콤팩트가 되면 한 줄에 쓴다.
 *  • 객체 콤팩트: `{ "k": v, "k2": v2 }` (중괄호 안쪽 공백·`, `·`: `). 빈 객체 `{}`.
 *  • 배열 콤팩트: `[v, v2]` (대괄호 안쪽 공백 없음). 빈 배열 `[]`.
 *  • 키 순서는 입력 순서 그대로 — **단, 정수형(array-index) 키는 예외**. JS `[[OwnPropertyKeys]]`
 *    규칙상 `"0"·"1"·"730"` 같은 canonical 정수 문자열 키는 오름차순으로 먼저 나열되고,
 *    애초에 `JSON.parse` 시점에 그렇게 재정렬돼 들어온다 — 이 계층에서 소스 순서 복원은 불가능하다.
 *    그래서 산출물 무결성 가드(build-data.assertNoReservedTokens)가 정수형 키를 아예 거부한다.
 *  • 스칼라는 JSON.stringify 그대로.
 *
 * JSON.stringify 는 비-ASCII(한글)를 이스케이프하지 않으므로 산출물은 사람이 읽을 수 있다.
 */

import { isPlainObject, type Json } from './jsonutil.ts'

/** 한 줄 목표 폭. 이 값 이하이면 콤팩트, 넘치면 펼침. */
export const WIDTH = 100

type CompactCache = WeakMap<object, string>

/**
 * 값의 단일 줄 표현. 부분트리를 조상마다 다시 만들지 않도록 노드별 1회만 계산해 캐시한다
 * (없으면 깊은 중첩에서 O(depth²)). 입력은 불변으로 간주 — 파이프라인이 매번 새 객체를 만든다.
 */
function compactForm(value: Json, cache: CompactCache): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const hit = cache.get(value)
  if (hit !== undefined) return hit
  let out: string
  if (Array.isArray(value)) {
    out = value.length === 0 ? '[]' : `[${value.map((v) => compactForm(v, cache)).join(', ')}]`
  } else {
    const keys = Object.keys(value)
    out =
      keys.length === 0
        ? '{}'
        : `{ ${keys.map((k) => `${JSON.stringify(k)}: ${compactForm(value[k]!, cache)}`).join(', ')} }`
  }
  cache.set(value, out)
  return out
}

/** 스칼라·빈 컨테이너는 펼칠 수 없다(항상 콤팩트). */
function canExpand(value: Json): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return false
}

/**
 * value 를 직렬화한다. column = 이 값이 시작하는 열(콤팩트 적합성 판정용),
 * indentLevel = 펼칠 때의 들여쓰기 깊이.
 */
function serializeValue(value: Json, indentLevel: number, column: number, cache: CompactCache): string {
  const compact = compactForm(value, cache)
  if (!canExpand(value) || column + compact.length <= WIDTH) return compact

  const pad = '  '.repeat(indentLevel + 1)
  const closePad = '  '.repeat(indentLevel)

  if (Array.isArray(value)) {
    const items = value.map((el) => pad + serializeValue(el, indentLevel + 1, pad.length, cache))
    return `[\n${items.join(',\n')}\n${closePad}]`
  }

  const obj = value as Record<string, Json>
  const items = Object.keys(obj).map((k) => {
    const prefix = `${pad}${JSON.stringify(k)}: `
    return prefix + serializeValue(obj[k]!, indentLevel + 1, prefix.length, cache)
  })
  return `{\n${items.join(',\n')}\n${closePad}}`
}

/** 끝개행 없는 정규 문자열(테스트·비교용). */
export function serialize(value: Json): string {
  return serializeValue(value, 0, 0, new WeakMap())
}

/** 파일 본문(끝개행 포함). */
export function serializeFile(value: Json): string {
  return `${serialize(value)}\n`
}
