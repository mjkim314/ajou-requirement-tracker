/**
 * R1 — 매니페스트 정합 테스트.
 *
 * 파일명 규약으로 자동 구성된 레지스트리·번들이 서로, 그리고 학과 큐레이션
 * (ajou-departments.ts)과 어긋나지 않는지 상시 검증한다. 손 등록이 사라진 대신
 * "규약을 지켰는가"를 여기서 기계적으로 확인한다.
 */
import { describe, expect, it } from 'vitest'

import {
  DATASETS,
  DATA_BUNDLES,
  GE_SLUG,
  MANIFEST_FILES,
  geCatalogByYear,
  geYears,
  requirementSetRegistry,
} from './manifest.js'
import { findDepartment } from './ajou-departments.js'
import { GE_CATALOG_YEARS } from './merge.js'

describe('매니페스트 파일 구성', () => {
  it('src/data 의 모든 JSON 이 세 규약 glob 중 하나에 걸린다 — 규약 밖 파일 0', () => {
    // prefix 오타(catalogg- 등)나 규약 밖 이름은 매니페스트가 조용히 무시하게 되므로,
    // 디렉터리 전체 열거와 매니페스트 열거를 대조해 잡는다.
    const allJson = Object.keys(import.meta.glob('./*.json'))
      .map((p) => p.split('/').pop()!)
      .sort()
    expect(allJson).toEqual(MANIFEST_FILES.map((f) => f.file).sort())
  })

  it('세트 노출 순서가 학과 큐레이션 순서를 따른다(첫 항목 = SW 2021 심화)', () => {
    // Object.values(requirementSetRegistry) 순서가 세트 전환 모달의 "기본 제공" 목록
    // 순서다. registry 재구성이 순서를 조용히 바꾸지 못하게 첫 항목을 고정한다.
    expect(Object.keys(requirementSetRegistry)[0]).toBe('rs_2021_sw_advanced')
  })

  it('데이터셋(학번×학과)마다 세트·카탈로그·추가전공 규칙 3종이 전부 있다 — 고아 파일 0', () => {
    const byKind = (kind: string) =>
      new Set(
        MANIFEST_FILES.filter((f) => f.kind === kind && f.slug !== GE_SLUG).map(
          (f) => `${f.year}-${f.slug}`,
        ),
      )
    const sets = byKind('set')
    const catalogs = byKind('catalog')
    const amrs = byKind('amr')
    // 세트 기준 누락은 manifest 로드가 이미 던지지만, 세트 없이 남은
    // 카탈로그·규칙(작성 중 미완 상태)도 커밋에 섞이지 않게 잡는다.
    expect([...catalogs].sort()).toEqual([...sets].sort())
    expect([...amrs].sort()).toEqual([...sets].sort())
  })

  it('교양(ge)은 카탈로그만 존재하고, 보유 학번은 빈틈없이 연속이다', () => {
    const geFiles = MANIFEST_FILES.filter((f) => f.slug === GE_SLUG)
    expect(geFiles.every((f) => f.kind === 'catalog')).toBe(true)
    expect(geYears.length).toBeGreaterThan(0)
    const [first] = geYears
    expect(geYears).toEqual(geYears.map((_, i) => first! + i))
    // merge.ts 의 클램프 폴백(범위 밖 학번 → 최근접 해)은 연속 보유를 전제한다.
    expect([...GE_CATALOG_YEARS]).toEqual(geYears)
    for (const year of geYears) {
      expect(geCatalogByYear[year]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('세트 id ↔ 파일명 규약', () => {
  const allSets = DATASETS.flatMap(({ year, slug, sets }) =>
    Object.entries(sets).map(([track, set]) => ({ year, slug, track, set })),
  )

  it.each(allSets.map((e) => [e.set.id, e] as const))('%s', (_id, { year, slug, track, set }) => {
    // id 가 파일명 좌표(학번·slug)와 track 을 그대로 반영해야 폴백·공유 복원이 안전하다.
    expect(set.id).toBe(`rs_${year}_${slug}_${track}`)
    expect(set.admissionYearFrom).toBe(year)
  })
})

describe('세트 department ↔ 학과 큐레이션(ajou-departments)', () => {
  it.each(DATASETS.map((d) => [`${d.year}-${d.slug}`, d] as const))(
    '%s',
    (_key, { slug, sets }) => {
      for (const set of Object.values(sets)) {
        expect(set.department, `${set.id}: department 미기재`).toBeTruthy()
        const dept = findDepartment(set.department!)
        expect(dept, `${set.id}: '${set.department}' 가 학과 목록에 없다(철자 확인)`).not.toBeNull()
        expect(dept!.slug, `${set.id}: 학과 slug 와 파일명 slug 불일치`).toBe(slug)
      }
    },
  )
})

describe('레지스트리 ↔ 번들', () => {
  it('요건 세트마다 번들이 있고, 번들 없는 세트·세트 없는 번들이 없다', () => {
    expect(Object.keys(DATA_BUNDLES).sort()).toEqual(Object.keys(requirementSetRegistry).sort())
  })

  it('모든 번들의 카탈로그·추가전공 규칙이 비어 있지 않다', () => {
    for (const [setId, bundle] of Object.entries(DATA_BUNDLES)) {
      expect(bundle.catalog.length, `${setId}: 카탈로그 비어 있음`).toBeGreaterThan(0)
      expect(bundle.rules.length, `${setId}: 추가전공 규칙 비어 있음`).toBeGreaterThan(0)
    }
  })

  it('같은 데이터셋의 과정(track)들은 같은 번들 객체를 공유한다', () => {
    for (const { sets, bundle } of DATASETS) {
      for (const set of Object.values(sets)) {
        expect(DATA_BUNDLES[set.id]).toBe(bundle)
      }
    }
  })
})
