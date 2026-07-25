/**
 * R4 상속(패치) 모델 — 역차분 (순수 함수).
 *
 * diffValue(parent, child) 는 병합기의 정확한 역이다:
 *
 *     applyPatch(parent, diffValue(parent, child))  ≡(deepEqual)  child
 *
 * 이 불변식이 역이식(backport)의 안전장치다. 기존 커밋본(child)과 그 부모(parent)에서
 * 최소 패치를 자동 계산하고, 병합기로 되돌려 원본과 값이 같은지 확인한다 — 손으로 패치를
 * 쓰지 않으므로 라운드트립이 구조적으로 보장된다.
 *
 * 값이 같으면 undefined(변경 없음)를 돌려준다. 호출자는 undefined 를 패치에서 생략한다.
 */

import { DELETE } from './merge.ts'
import {
  arraysEqual,
  clone,
  deepEqual,
  isPlainObject,
  keyFieldOf,
  type Json,
  type JsonObject,
} from './jsonutil.ts'

/** parent → child 최소 패치. 변경 없으면 undefined. */
export function diffValue(parent: Json, child: Json): Json | undefined {
  if (deepEqual(parent, child)) return undefined

  if (Array.isArray(parent) && Array.isArray(child)) {
    return diffArray(parent, child)
  }
  if (isPlainObject(parent) && isPlainObject(child)) {
    return diffObject(parent, child)
  }
  // 타입 불일치 또는 스칼라 변경 → 통째 교체.
  return clone(child)
}

function diffObject(parent: JsonObject, child: JsonObject): JsonObject {
  const out: JsonObject = {}
  // 변경·신규 키를 child 순서로(패치를 대상 순서대로 읽히게).
  for (const k of Object.keys(child)) {
    if (!Object.prototype.hasOwnProperty.call(parent, k)) {
      out[k] = clone(child[k]!)
    } else {
      const d = diffValue(parent[k]!, child[k]!)
      if (d !== undefined) out[k] = d
    }
  }
  // 삭제된 키.
  for (const k of Object.keys(parent)) {
    if (!Object.prototype.hasOwnProperty.call(child, k)) out[k] = DELETE
  }
  return out
}

function diffArray(parent: Json[], child: Json[]): Json {
  // 키 필드 감지 실패(키 없는 배열)나 키 중복이면 통째 교체 — 항상 라운드트립 안전.
  const kf = keyFieldOf(parent) ?? keyFieldOf(child)
  if (kf === null) return clone(child)

  const pKeys = parent.map((e) => (e as JsonObject)[kf] as string)
  const cKeys = child.map((e) => (e as JsonObject)[kf] as string)
  if (hasDuplicate(pKeys) || hasDuplicate(cKeys)) return clone(child)

  const pMap = new Map(parent.map((e) => [(e as JsonObject)[kf] as string, e]))
  const cMap = new Map(child.map((e) => [(e as JsonObject)[kf] as string, e]))

  const out: JsonObject = {}
  const removed = pKeys.filter((k) => !cMap.has(k))
  if (removed.length > 0) out['$remove'] = clone(removed)

  for (const k of cKeys) {
    if (pMap.has(k)) {
      const d = diffValue(pMap.get(k)!, cMap.get(k)!)
      if (d !== undefined) out[k] = d // 두 객체의 diff → 객체 패치(applyPatch 가 깊은 병합)
    } else {
      out[k] = clone(cMap.get(k)!) // 완전한 새 원소
    }
  }

  // 자연 순서 = (부모 순서 − 삭제) ++ (추가분, child 순서). child 순서와 다르면 $order 명시.
  const retained = pKeys.filter((k) => cMap.has(k))
  const added = cKeys.filter((k) => !pMap.has(k))
  const natural = [...retained, ...added]
  if (!arraysEqual(natural, cKeys)) out['$order'] = clone(cKeys)

  return out
}

function hasDuplicate(keys: string[]): boolean {
  return new Set(keys).size !== keys.length
}
