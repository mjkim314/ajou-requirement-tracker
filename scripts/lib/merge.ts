/**
 * R4 상속(패치) 모델 — 병합기 (순수 함수).
 *
 * 소스(`data-src/`)의 base + patch 조각을 하나의 완전본 값으로 합친다.
 * 앱이 읽는 런타임 산출물(`src/data/*.json`)은 이 병합 결과이며, 엔진·앱은
 * 병합을 전혀 알지 못한다(빌드 타임 전용).
 *
 * ── 패치 문법 ─────────────────────────────────────────────────
 * 패치는 평범한 JSON 객체다. base 의 대응 값 형태에 따라 해석이 갈린다:
 *
 *   • base[k] 가 스칼라/부재  → 패치 값을 그대로 대입(신규·교체)
 *   • base[k] 가 객체 + 패치 값이 객체  → 깊은 병합(재귀)
 *   • base[k] 가 배열 + 패치 값이 "배열" → 통째 교체(codes·requiredCourses 등 키 없는 목록)
 *   • base[k] 가 배열 + 패치 값이 "객체" → 키 병합(아래)
 *   • 패치 값이 "$delete"(문자열 센티널) → 그 키를 base 에서 제거
 *
 * ── 키 배열 병합(객체 형태 패치) ──────────────────────────────
 * 원소는 courseKey 또는 id 로 식별한다. 패치 객체의 각 항목:
 *   • "키": <하위패치>  → 그 키를 가진 기존 원소에 깊은 병합
 *   • "키": <완전한 새 원소>  → base 에 없는 키면 새 원소로 추가(뒤에 붙음)
 *   • "$remove": ["키", …]   → 해당 원소 삭제
 *   • "$order":  ["키", …]   → 결과 순서를 이 목록으로 강제(중간 삽입/재배열용)
 *   • "$include" 는 이 단계 전에 expandIncludes 로 이미 해소됨(여기 도달 금지)
 *
 * 순서 규칙: $order 가 있으면 그 순서(미열거 키는 자연 순서로 뒤에 append),
 * 없으면 (base 순서 − 삭제) ++ (추가분, 패치 등장 순서).
 */

import {
  clone,
  isPlainObject,
  keyFieldOf,
  type Json,
  type JsonObject,
} from './jsonutil.ts'

/** 키 제거 센티널. 실제 데이터에 이 문자열 값이 등장하지 않는다는 전제. */
export const DELETE = '$delete'

const ARRAY_DIRECTIVES = new Set(['$remove', '$order', '$include'])

/** base 값에 patch 를 적용한 새 값을 돌려준다(입력 불변). */
export function applyPatch(base: Json, patch: Json): Json {
  // 패치가 객체가 아니면(스칼라·배열 리터럴) 통째 교체.
  if (!isPlainObject(patch)) return clone(patch)

  // 패치는 객체. base 가 배열이면 키 배열 병합.
  if (Array.isArray(base)) return mergeKeyedArray(base, patch)

  // base 가 객체가 아니면(스칼라·부재) 객체 패치를 리터럴 값으로 간주.
  if (!isPlainObject(base)) return clone(patch)

  // base·patch 모두 객체 → 깊은 병합.
  const result: JsonObject = {}
  for (const k of Object.keys(base)) result[k] = base[k]!
  for (const k of Object.keys(patch)) {
    const pv = patch[k]!
    if (pv === DELETE) {
      delete result[k]
      continue
    }
    const bv = k in result ? result[k]! : undefined
    if (Array.isArray(bv) && isPlainObject(pv)) {
      result[k] = mergeKeyedArray(bv, pv)
    } else if (isPlainObject(bv) && isPlainObject(pv)) {
      result[k] = applyPatch(bv, pv)
    } else {
      result[k] = clone(pv)
    }
  }
  return clone(result)
}

function mergeKeyedArray(baseArr: Json[], patch: JsonObject): Json[] {
  const entryKeys = Object.keys(patch).filter((k) => !ARRAY_DIRECTIVES.has(k))

  // 키 필드 감지: base 우선, 비면 패치가 추가하는 원소에서 추론.
  let keyField = keyFieldOf(baseArr)
  if (keyField === null) {
    const sample = entryKeys.map((k) => patch[k]).find((v) => isPlainObject(v)) as
      | JsonObject
      | undefined
    if (sample && typeof sample['courseKey'] === 'string') keyField = 'courseKey'
    else if (sample && typeof sample['id'] === 'string') keyField = 'id'
  }
  if (keyField === null) {
    throw new Error(
      `키 배열 병합 불가: 원소의 키 필드(courseKey/id)를 감지할 수 없다 (patch keys: ${entryKeys.join(', ')})`,
    )
  }
  const kf = keyField

  const map = new Map<string, Json>()
  const order: string[] = []
  for (const el of baseArr) {
    if (!isPlainObject(el) || typeof el[kf] !== 'string') {
      throw new Error(`키 배열 원소에 문자열 ${kf} 가 없다: ${JSON.stringify(el)}`)
    }
    const key = el[kf] as string
    map.set(key, el)
    order.push(key)
  }

  for (const key of entryKeys) {
    const sub = patch[key]!
    if (map.has(key)) {
      map.set(key, applyPatch(map.get(key)!, sub))
    } else {
      // 새 원소: 완전한 원소여야 하고 키 필드가 항목 키와 일치해야 한다.
      if (!isPlainObject(sub) || sub[kf] !== key) {
        throw new Error(
          `새 원소 추가 오류: '${key}' 항목이 완전한 원소가 아니거나 ${kf} 가 '${key}' 와 다르다`,
        )
      }
      map.set(key, sub)
      order.push(key)
    }
  }

  const removes = patch['$remove']
  if (removes !== undefined) {
    if (!Array.isArray(removes)) throw new Error('$remove 는 문자열 배열이어야 한다')
    for (const key of removes) {
      if (typeof key !== 'string') throw new Error('$remove 원소는 문자열이어야 한다')
      map.delete(key)
    }
  }

  const explicitOrder = patch['$order']
  let finalOrder: string[]
  if (explicitOrder !== undefined) {
    if (!Array.isArray(explicitOrder) || explicitOrder.some((k) => typeof k !== 'string')) {
      throw new Error('$order 는 문자열 배열이어야 한다')
    }
    const listed = explicitOrder as string[]
    const seen = new Set(listed)
    // $order 에 없는 잔여 키는 자연 순서로 뒤에 붙인다.
    finalOrder = [...listed.filter((k) => map.has(k)), ...order.filter((k) => map.has(k) && !seen.has(k))]
  } else {
    finalOrder = order.filter((k) => map.has(k))
  }

  return clone(finalOrder.map((k) => map.get(k)!))
}

/**
 * $include 해소 — 소스 값을 순회하며 배열 안의 `{ "$include": "이름" }` 마커를
 * registry[이름] 조각(배열)으로 펼친다. 조각도 재귀적으로 펼친다(순환은 방문 집합으로 차단).
 * 병합 전에 base·patch 양쪽에 한 번씩 적용한다.
 *
 * `used` 를 넘기면 실제로 소비된 조각 이름을 그 집합에 기록한다 — 빌드가 "등록됐으나
 * 아무 $include 도 참조하지 않는 사장 조각"을 게이트에서 잡는 데 쓴다(backport 가 $include 를
 * 인라인으로 되돌리면 조각이 사장되는데, 산출물은 바이트 동일이라 그것만으론 안 잡힌다).
 */
export function expandIncludes(
  value: Json,
  registry: Record<string, Json[]>,
  stack: readonly string[] = [],
  used?: Set<string>,
): Json {
  if (Array.isArray(value)) {
    const out: Json[] = []
    for (const el of value) {
      if (isPlainObject(el) && '$include' in el) {
        const keys = Object.keys(el)
        if (keys.length !== 1) {
          throw new Error(`$include 마커에는 다른 키를 둘 수 없다: ${JSON.stringify(el)}`)
        }
        const name = el['$include']
        if (typeof name !== 'string') throw new Error('$include 값은 문자열이어야 한다')
        if (stack.includes(name)) {
          throw new Error(`$include 순환: ${[...stack, name].join(' → ')}`)
        }
        const fragment = registry[name]
        if (!fragment) throw new Error(`$include 조각을 찾을 수 없다: '${name}'`)
        used?.add(name)
        const expanded = expandIncludes(fragment, registry, [...stack, name], used) as Json[]
        out.push(...expanded)
      } else {
        out.push(expandIncludes(el, registry, stack, used))
      }
    }
    return out
  }
  if (isPlainObject(value)) {
    const out: JsonObject = {}
    for (const k of Object.keys(value)) out[k] = expandIncludes(value[k]!, registry, stack, used)
    return out
  }
  return value
}
