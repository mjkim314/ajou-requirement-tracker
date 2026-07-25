/**
 * R4 상속(패치) 모델 — 병합기·역차분·직렬화·$include 단위 테스트.
 *
 * 실데이터 라운드트립은 r4-build.test.ts(재생성=커밋본)가 커버한다. 여기서는 병합
 * 문법의 경계 사례(중간 삽입 $order, $delete, 키 없는 배열 통째 교체, $include 순환 등)를
 * 합성 입력으로 못박는다.
 */
import { describe, expect, it } from 'vitest'

import { applyPatch, expandIncludes, DELETE } from '../../../scripts/lib/merge.ts'
import { diffValue } from '../../../scripts/lib/diff.ts'
import { serialize, serializeFile, WIDTH } from '../../../scripts/lib/serialize.ts'
import { deepEqual, type Json } from '../../../scripts/lib/jsonutil.ts'

describe('applyPatch — 객체 깊은 병합', () => {
  it('스칼라 덮어쓰기 · 신규 키 추가 · 기존 키 위치 보존', () => {
    const base = { a: 1, b: 2, nested: { x: 1, y: 2 } }
    const out = applyPatch(base, { b: 3, c: 4, nested: { y: 20 } })
    expect(out).toEqual({ a: 1, b: 3, nested: { x: 1, y: 20 }, c: 4 })
    expect(Object.keys(out as object)).toEqual(['a', 'b', 'nested', 'c']) // 순서 보존
  })

  it('$delete 로 키 제거', () => {
    expect(applyPatch({ a: 1, b: 2 }, { b: DELETE })).toEqual({ a: 1 })
  })

  it('입력 불변(base 를 훼손하지 않음)', () => {
    const base = { a: { b: 1 } }
    applyPatch(base, { a: { b: 2 } })
    expect(base).toEqual({ a: { b: 1 } })
  })
})

describe('applyPatch — 배열', () => {
  it('스칼라 배열은 통째 교체(패치가 배열)', () => {
    expect(applyPatch({ codes: ['A', 'B'] }, { codes: ['C'] })).toEqual({ codes: ['C'] })
  })

  it('키 배열: id 원소 수정(패치가 객체)', () => {
    const base = { items: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] }
    expect(applyPatch(base, { items: { y: { v: 20 } } })).toEqual({
      items: [{ id: 'x', v: 1 }, { id: 'y', v: 20 }],
    })
  })

  it('키 배열: 새 원소 추가는 뒤에 붙는다', () => {
    const base = { items: [{ id: 'x' }] }
    expect(applyPatch(base, { items: { z: { id: 'z', v: 9 } } })).toEqual({
      items: [{ id: 'x' }, { id: 'z', v: 9 }],
    })
  })

  it('키 배열: $remove 로 삭제', () => {
    const base = { items: [{ id: 'x' }, { id: 'y' }] }
    expect(applyPatch(base, { items: { $remove: ['x'] } })).toEqual({ items: [{ id: 'y' }] })
  })

  it('키 배열: $order 로 중간 삽입/재배열', () => {
    const base = { items: [{ id: 'a' }, { id: 'b' }] }
    const out = applyPatch(base, { items: { c: { id: 'c' }, $order: ['a', 'c', 'b'] } })
    expect((out as { items: { id: string }[] }).items.map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('키 배열: courseKey 감지 · 중첩 키 배열 재귀 병합', () => {
    const base = { catalog: [{ courseKey: 'K1', codes: ['A'] }] }
    expect(applyPatch(base, { catalog: { K1: { codes: ['A', 'B'] } } })).toEqual({
      catalog: [{ courseKey: 'K1', codes: ['A', 'B'] }],
    })
  })

  it('새 원소의 키 필드가 항목 키와 다르면 던진다', () => {
    expect(() => applyPatch({ items: [{ id: 'x' }] }, { items: { z: { id: 'WRONG' } } })).toThrow()
  })
})

describe('diffValue — applyPatch 의 역(라운드트립 속성)', () => {
  const roundtrip = (parent: Json, child: Json) => {
    const patch = diffValue(parent, child)
    const rebuilt = applyPatch(parent, patch ?? {})
    expect(deepEqual(rebuilt, child), `diff→merge 불일치\nparent=${serialize(parent)}\nchild=${serialize(child)}\npatch=${serialize(patch ?? {})}`).toBe(true)
  }

  const cases: [string, Json, Json][] = [
    ['동일 → 변경 없음', { a: 1 }, { a: 1 }],
    ['스칼라 변경', { a: 1 }, { a: 2 }],
    ['키 추가·삭제', { a: 1, b: 2 }, { a: 1, c: 3 }],
    ['중첩 객체', { n: { x: 1, y: 2 } }, { n: { x: 1, y: 9, z: 3 } }],
    ['키 배열 수정', { it: [{ id: 'a', v: 1 }] }, { it: [{ id: 'a', v: 2 }] }],
    ['키 배열 추가(끝)', { it: [{ id: 'a' }] }, { it: [{ id: 'a' }, { id: 'b' }] }],
    ['키 배열 추가(중간) → $order', { it: [{ id: 'a' }, { id: 'b' }] }, { it: [{ id: 'a' }, { id: 'c' }, { id: 'b' }] }],
    ['키 배열 재배열 → $order', { it: [{ id: 'a' }, { id: 'b' }] }, { it: [{ id: 'b' }, { id: 'a' }] }],
    ['키 배열 삭제', { it: [{ id: 'a' }, { id: 'b' }] }, { it: [{ id: 'b' }] }],
    ['스칼라 배열 통째 교체', { codes: ['A', 'B'] }, { codes: ['C'] }],
    ['타입 변경(스칼라→객체)', { a: 1 }, { a: { b: 2 } }],
    ['타입 변경(객체→배열)', { a: { b: 1 } }, { a: [1, 2] }],
    ['빈 배열 ↔ 원소', { it: [] as Json[] }, { it: [{ id: 'a' }] }],
    ['키 중복 배열은 통째 교체', { it: [{ id: 'a' }, { id: 'a', v: 2 }] }, { it: [{ id: 'a', v: 9 }] }],
  ]
  it.each(cases)('%s', (_label, parent, child) => roundtrip(parent, child))

  it('동일 값이면 undefined', () => {
    expect(diffValue({ a: [1, 2], b: 'x' }, { a: [1, 2], b: 'x' })).toBeUndefined()
  })
})

describe('serialize — 정규·결정론', () => {
  it('parse(serialize(x)) ≡ x · 2회 결정론', () => {
    const v: Json = { a: 1, s: '한글', arr: [{ id: 'x', codes: ['A'] }], n: null, b: true }
    expect(JSON.parse(serialize(v))).toEqual(v)
    expect(serialize(v)).toBe(serialize(v))
  })

  it('콤팩트 리프: 짧은 객체는 한 줄, 넘치면 펼침', () => {
    expect(serialize({ id: 'x', v: 1 })).toBe('{ "id": "x", "v": 1 }')
    const long = { id: 'x', note: 'y'.repeat(WIDTH) }
    expect(serialize(long)).toContain('\n')
  })

  it('배열 콤팩트는 안쪽 공백 없음, 객체는 있음 · 빈 값', () => {
    expect(serialize(['a', 'b'])).toBe('["a", "b"]')
    expect(serialize({ k: 'v' })).toBe('{ "k": "v" }')
    expect(serialize([])).toBe('[]')
    expect(serialize({})).toBe('{}')
  })

  it('키 순서 보존(정렬하지 않음)', () => {
    expect(serialize({ z: 1, a: 2, m: 3 })).toBe('{ "z": 1, "a": 2, "m": 3 }')
  })

  it('한글은 이스케이프하지 않는다', () => {
    expect(serialize({ name: '소프트웨어학과' })).toContain('소프트웨어학과')
  })

  it('serializeFile 은 끝개행을 붙인다', () => {
    expect(serializeFile({ a: 1 }).endsWith('}\n')).toBe(true)
  })
})

describe('expandIncludes — 조각 펼침', () => {
  const reg: Record<string, Json[]> = {
    'ge/buckets-2021': [{ id: 'ajou_character' }, { id: 'english' }],
    'nested': [{ id: 'a' }, { $include: 'ge/buckets-2021' }],
    'cycle': [{ $include: 'cycle' }],
  }

  it('배열 안 마커를 조각 원소로 치환(위치 보존)', () => {
    const out = expandIncludes(
      { buckets: [{ $include: 'ge/buckets-2021' }, { id: 'area_liberal' }] },
      reg,
    )
    expect((out as { buckets: { id: string }[] }).buckets.map((b) => b.id)).toEqual([
      'ajou_character', 'english', 'area_liberal',
    ])
  })

  it('조각 안의 $include 도 재귀적으로 펼친다', () => {
    const out = expandIncludes({ b: [{ $include: 'nested' }] }, reg)
    expect((out as { b: { id: string }[] }).b.map((x) => x.id)).toEqual(['a', 'ajou_character', 'english'])
  })

  it('없는 조각·순환·마커에 다른 키가 있으면 던진다', () => {
    expect(() => expandIncludes({ b: [{ $include: 'missing' }] }, reg)).toThrow()
    expect(() => expandIncludes({ b: [{ $include: 'cycle' }] }, reg)).toThrow()
    expect(() => expandIncludes({ b: [{ $include: 'ge/buckets-2021', extra: 1 }] }, reg)).toThrow()
  })

  it('마커 없는 값은 그대로', () => {
    const v: Json = { a: [1, 2], b: { c: 3 } }
    expect(expandIncludes(v, reg)).toEqual(v)
  })

  it('used 집합에 실제 소비된 조각 이름만 기록(고아 조각 감지 근거)', () => {
    const used = new Set<string>()
    expandIncludes({ b: [{ $include: 'nested' }] }, reg, [], used)
    expect([...used].sort()).toEqual(['ge/buckets-2021', 'nested']) // nested 가 ge/buckets-2021 을 다시 참조
    const none = new Set<string>()
    expandIncludes({ a: [1, 2] }, reg, [], none)
    expect([...none]).toEqual([])
  })
})
