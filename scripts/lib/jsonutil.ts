/**
 * R4 상속(패치) 모델 — JSON 값 기초 유틸 (순수).
 *
 * 여기서 다루는 값은 전부 JSON 산출물이다(undefined·함수·순환 없음).
 * merge/diff/serialize 가 공유하는 최소 원시 연산만 둔다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json }

export type JsonObject = { [k: string]: Json }

export function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** JSON 값 깊은 복제. */
export function clone<T extends Json>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  return JSON.parse(JSON.stringify(v)) as T
}

/**
 * 구조적 동등성. 배열은 순서 민감, 객체는 키 순서 무관.
 * R0 스냅샷 해시(stableStringify)와 동일한 "값" 개념 — 라운드트립 게이트의 판정 기준.
 */
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i]!, b[i]!)) return false
    }
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false
      if (!deepEqual(a[k]!, b[k]!)) return false
    }
    return true
  }
  return false
}

/**
 * 키 배열 키 필드 자동 감지: 전 원소가 courseKey 를 가지면 'courseKey',
 * 전 원소가 id 를 가지면 'id', 아니면 null(= 키 없는 배열, 통째 교체 대상).
 */
export function keyFieldOf(arr: Json[]): 'courseKey' | 'id' | null {
  if (arr.length === 0) return null
  if (arr.every((e) => isPlainObject(e) && typeof e['courseKey'] === 'string')) return 'courseKey'
  if (arr.every((e) => isPlainObject(e) && typeof e['id'] === 'string')) return 'id'
  return null
}

export function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
