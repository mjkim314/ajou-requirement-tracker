import { describe, expect, it } from 'vitest'
import type { CatalogEntry } from '../engine/index'
import { chosungOf, normalizeQuery, searchCatalog } from './search'

function entry(courseKey: string, name: string, codes: string[], aliases: string[] = []): CatalogEntry {
  return { courseKey, name, codes, aliases, credits: 3, defaultBucket: 'major_elective' }
}

const CATALOG: CatalogEntry[] = [
  entry('SW-ALGORITHM', '알고리즘', ['SCE324']),
  entry('SW-OS', '운영체제', ['SCE315']),
  entry('SW-DATA-STRUCT', '자료구조', ['SCE205', 'SCE202']),
  entry('SW-DB', '데이터베이스', ['SCE411'], ['데이터베이스및실습']),
  entry('SW-NETWORK', '컴퓨터네트워크', ['SCE342']),
]

describe('chosungOf', () => {
  it('한글 음절을 초성으로 변환한다', () => {
    expect(chosungOf('알고리즘')).toBe('ㅇㄱㄹㅈ')
    expect(chosungOf('자료구조')).toBe('ㅈㄹㄱㅈ')
    expect(chosungOf('운영체제')).toBe('ㅇㅇㅊㅈ')
  })

  it('한글이 아닌 문자는 소문자로 그대로 둔다', () => {
    expect(chosungOf('OS운영')).toBe('osㅇㅇ')
    expect(chosungOf('SCE324')).toBe('sce324')
  })
})

describe('normalizeQuery', () => {
  it('소문자화하고 공백·구두점을 제거한다', () => {
    expect(normalizeQuery('  SCE 324 ')).toBe('sce324')
    expect(normalizeQuery('데이터베이스 및 실습')).toBe('데이터베이스및실습')
    expect(normalizeQuery('해외-인턴십')).toBe('해외인턴십')
  })
})

describe('searchCatalog', () => {
  it('과목명 부분일치로 찾는다', () => {
    const r = searchCatalog('알고', CATALOG)
    expect(r[0]?.courseKey).toBe('SW-ALGORITHM')
  })

  it('학수번호 정확일치를 최상위로 올린다', () => {
    const r = searchCatalog('SCE205', CATALOG)
    expect(r[0]?.courseKey).toBe('SW-DATA-STRUCT')
  })

  it('학수번호 접두로도 찾는다', () => {
    const r = searchCatalog('sce3', CATALOG)
    const keys = r.map((e) => e.courseKey)
    expect(keys).toContain('SW-ALGORITHM')
    expect(keys).toContain('SW-OS')
    expect(keys).toContain('SW-NETWORK')
  })

  it('초성으로 찾는다', () => {
    expect(searchCatalog('ㅇㄱㄹㅈ', CATALOG)[0]?.courseKey).toBe('SW-ALGORITHM')
    // 접두 초성도 매칭
    const r = searchCatalog('ㅈㄹ', CATALOG)
    expect(r[0]?.courseKey).toBe('SW-DATA-STRUCT')
  })

  it('이표기(alias)로도 찾는다', () => {
    const r = searchCatalog('실습', CATALOG)
    expect(r.map((e) => e.courseKey)).toContain('SW-DB')
  })

  it('빈 질의는 결과가 없다', () => {
    expect(searchCatalog('', CATALOG)).toHaveLength(0)
    expect(searchCatalog('   ', CATALOG)).toHaveLength(0)
  })

  it('매칭이 없으면 빈 배열', () => {
    expect(searchCatalog('없는과목명xyz', CATALOG)).toHaveLength(0)
  })

  it('limit을 지킨다', () => {
    expect(searchCatalog('sce', CATALOG, 2)).toHaveLength(2)
  })
})
