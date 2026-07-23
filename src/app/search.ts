/**
 * 과목 검색 · 자동완성 (순수).
 *
 * 과목명 · 학수번호 · **초성**으로 카탈로그를 검색한다. React·localStorage를
 * 참조하지 않으므로 화면 없이 테스트할 수 있다. 컴포넌트는 buildSearchDocs로
 * 인덱스를 한 번 만들어 두고(useMemo) searchDocs로 매 입력을 질의한다.
 */

import type { CatalogEntry } from '../engine/index'

// 한글 음절(U+AC00–U+D7A3)의 초성 19자.
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]
const CHOSEONG_SET = new Set(CHOSEONG)
const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3
/** 한 음절이 담는 (중성×종성) 경우의 수 = 21 × 28. */
const SYLLABLE_BLOCK = 588

/** 호환 자모 초성 하나인지(예: 사용자가 입력한 'ㄱ'). */
export function isChoseongChar(ch: string): boolean {
  return CHOSEONG_SET.has(ch)
}

/**
 * 문자열의 초성 시퀀스. 한글 음절은 초성 자모로, 그 외 문자는 소문자로 그대로 둔다.
 * (영문·숫자가 섞여도 초성 질의와 자연스럽게 비교되도록.)
 */
export function chosungOf(str: string): string {
  let out = ''
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSEONG[Math.floor((code - HANGUL_BASE) / SYLLABLE_BLOCK)]
    } else {
      out += ch.toLowerCase()
    }
  }
  return out
}

/** 검색 정규화: 소문자화 + 공백·구두점 제거(표기 흔들림 흡수). */
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[\s·.,()/\-–—]+/g, '')
}

/** 질의가 초성 자모로만 이뤄졌는지(초성 검색 모드 판별). */
function isChoseongQuery(q: string): boolean {
  if (q.length === 0) return false
  for (const ch of q) {
    if (!CHOSEONG_SET.has(ch)) return false
  }
  return true
}

export interface SearchDoc {
  entry: CatalogEntry
  /** 정규화된 이름. */
  name: string
  /** 이름의 초성(정규화). */
  nameChosung: string
  /** 정규화된 학수번호들. */
  codes: string[]
  /** 정규화된 이표기(구명칭·철자 흔들림·영문명). */
  aliases: string[]
  /** 이표기들의 초성. */
  aliasChosung: string[]
}

/** 카탈로그 → 검색 인덱스. 컴포넌트에서 카탈로그가 바뀔 때만 다시 만든다. */
export function buildSearchDocs(catalog: CatalogEntry[]): SearchDoc[] {
  return catalog
    .filter((e) => e.active !== false)
    .map((entry) => {
      const aliasList = [...(entry.aliases ?? []), ...(entry.nameEn ? [entry.nameEn] : [])]
      return {
        entry,
        name: normalizeQuery(entry.name),
        nameChosung: normalizeQuery(chosungOf(entry.name)),
        codes: (entry.codes ?? []).map(normalizeQuery),
        aliases: aliasList.map(normalizeQuery),
        aliasChosung: aliasList.map((a) => normalizeQuery(chosungOf(a))),
      }
    })
}

/**
 * 한 문서의 질의 점수. null이면 매칭 안 됨. 작을수록 상위.
 * 학수번호 정확일치 > 이름 접두 > 초성 접두 > 부분일치.
 */
function scoreDoc(q: string, choseongMode: boolean, doc: SearchDoc): number | null {
  if (choseongMode) {
    if (doc.nameChosung.startsWith(q)) return 10
    if (doc.aliasChosung.some((a) => a.startsWith(q))) return 14
    if (doc.nameChosung.includes(q)) return 20
    if (doc.aliasChosung.some((a) => a.includes(q))) return 24
    return null
  }
  if (doc.codes.some((c) => c === q)) return 0
  if (doc.codes.some((c) => c.startsWith(q))) return 5
  if (doc.name.startsWith(q)) return 8
  if (doc.aliases.some((a) => a.startsWith(q))) return 11
  if (doc.name.includes(q)) return 15
  if (doc.aliases.some((a) => a.includes(q))) return 18
  // 완성형으로 입력했지만 초성만 우연히 맞는 경우(예: 이름 일부의 초성)까지 폭넓게.
  if (doc.nameChosung.startsWith(q)) return 22
  return null
}

/**
 * 인덱스 질의. 점수 오름차순 → 같은 점수는 이름 가나다순.
 * 빈 질의는 빈 배열(자동완성은 입력이 있을 때만 뜬다).
 */
export function searchDocs(query: string, docs: SearchDoc[], limit = 8): CatalogEntry[] {
  const q = normalizeQuery(query)
  if (q.length === 0) return []
  const choseongMode = isChoseongQuery(q)
  const scored: { score: number; doc: SearchDoc }[] = []
  for (const doc of docs) {
    const score = scoreDoc(q, choseongMode, doc)
    if (score != null) scored.push({ score, doc })
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.doc.name < b.doc.name ? -1 : a.doc.name > b.doc.name ? 1 : 0
  })
  return scored.slice(0, limit).map((s) => s.doc.entry)
}

/** 편의 함수(인덱스를 매번 만든다 — 테스트·소규모 호출용). */
export function searchCatalog(query: string, catalog: CatalogEntry[], limit = 8): CatalogEntry[] {
  return searchDocs(query, buildSearchDocs(catalog), limit)
}
