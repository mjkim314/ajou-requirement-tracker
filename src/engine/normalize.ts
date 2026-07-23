/**
 * [2] Normalize — 입력 문자열을 courseKey로 해석한다.
 *
 * 조회 순서: courseKey → codes[] → name → aliases[]
 * - 실패 시 오류가 아니라 courseKey = null 로 두고 입력값을 보존한다.
 * - 학수번호 중복(SCE411 등)은 후보를 모두 반환한다(사용자 선택 요청용).
 *
 * 초성 검색 등 UI 자동완성은 8장(검색) 소관이라 여기서는 다루지 않는다.
 * 순수 함수 — 저장소·시각·난수를 참조하지 않는다.
 */

import type { CatalogEntry } from './types.js'

/**
 * 비교용 정규화: 공백·중점(·)·괄호 제거 후 소문자화.
 * 설계명세서 8.4 "공백·중점·괄호 제거 후 비교" 규칙.
 */
export function normalizeText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s·・|()[\]{}]/g, '')
}

export interface CatalogIndex {
  byKey: Map<string, CatalogEntry>
  byCode: Map<string, CatalogEntry[]>
  byName: Map<string, CatalogEntry[]>
  byAlias: Map<string, CatalogEntry[]>
  entries: CatalogEntry[]
}

function push<K>(map: Map<K, CatalogEntry[]>, key: K, entry: CatalogEntry): void {
  const list = map.get(key)
  if (list) {
    // 같은 항목 중복 삽입 방지
    if (!list.includes(entry)) list.push(entry)
  } else {
    map.set(key, [entry])
  }
}

/** 카탈로그를 조회용 인덱스로 1회 변환한다(로드 시 메모리 보관). */
export function buildCatalogIndex(catalog: CatalogEntry[]): CatalogIndex {
  const byKey = new Map<string, CatalogEntry>()
  const byCode = new Map<string, CatalogEntry[]>()
  const byName = new Map<string, CatalogEntry[]>()
  const byAlias = new Map<string, CatalogEntry[]>()

  for (const entry of catalog) {
    byKey.set(entry.courseKey, entry)
    for (const code of entry.codes ?? []) {
      push(byCode, normalizeText(code), entry)
    }
    push(byName, normalizeText(entry.name), entry)
    for (const alias of entry.aliases ?? []) {
      push(byAlias, normalizeText(alias), entry)
    }
  }

  return { byKey, byCode, byName, byAlias, entries: catalog }
}

export interface ResolutionOutcome {
  /** 정확히 하나로 해석되면 그 courseKey, 아니면 null. */
  courseKey: string | null
  /** 후보 courseKey 목록(0/1/N). */
  candidates: string[]
  /** 후보가 2개 이상이라 사용자 선택이 필요. */
  ambiguous: boolean
  /** 후보가 없음(카탈로그 밖 과목). */
  unmatched: boolean
}

/**
 * 하나의 입력 문자열(courseKey · 학수번호 · 과목명 · 별칭)을 courseKey 후보로 해석한다.
 * 각 층에서 후보가 나오면 그 층에서 멈춘다(상위 층 우선).
 */
export function resolveQuery(query: string, index: CatalogIndex): ResolutionOutcome {
  const raw = query.trim()
  if (raw.length === 0) {
    return { courseKey: null, candidates: [], ambiguous: false, unmatched: true }
  }

  // 1층: courseKey 직접 일치 (대소문자 그대로)
  if (index.byKey.has(raw)) {
    return { courseKey: raw, candidates: [raw], ambiguous: false, unmatched: false }
  }

  const norm = normalizeText(query)

  // 2~4층: 학수번호 → 과목명 → 별칭
  const layers = [index.byCode, index.byName, index.byAlias]
  for (const layer of layers) {
    const hits = layer.get(norm)
    if (hits && hits.length > 0) {
      const keys = dedupe(hits.map((e) => e.courseKey))
      return {
        courseKey: keys.length === 1 ? keys[0]! : null,
        candidates: keys,
        ambiguous: keys.length > 1,
        unmatched: false,
      }
    }
  }

  return { courseKey: null, candidates: [], ambiguous: false, unmatched: true }
}

/**
 * 수강 기록 하나를 정규화한다.
 * - courseKey가 이미 확정돼 있으면 그대로 신뢰(카탈로그에 있으면).
 * - 없으면 nameSnapshot을 조회해서 해석한다.
 */
export function normalizeCourse(
  input: { courseKey: string | null; nameSnapshot: string },
  index: CatalogIndex
): ResolutionOutcome {
  if (input.courseKey && index.byKey.has(input.courseKey)) {
    return {
      courseKey: input.courseKey,
      candidates: [input.courseKey],
      ambiguous: false,
      unmatched: false,
    }
  }
  // courseKey가 없거나 카탈로그에 없으면 이름/코드로 재해석
  return resolveQuery(input.courseKey ?? input.nameSnapshot, index)
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)]
}
