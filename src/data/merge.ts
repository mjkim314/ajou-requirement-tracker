/**
 * 학과 카탈로그 + 다산학부대학 교양 카탈로그 합성 (순수 함수).
 *
 * 교양은 학과가 아니라 전 학과가 공유하는 기반이라 카탈로그를 따로 보관한다
 * (`catalog-{연도}-ge.json`). 앱이 실제로 쓰는 카탈로그는 **학번에 맞는 교양 +
 * 학과** 를 합친 것이고, 그 합성 규칙이 이 모듈이다.
 *
 * 규칙 세 가지:
 *  1. **학과 우선** — 같은 courseKey나 같은 과목명이 양쪽에 있으면 학과 정의가 이긴다.
 *     (확률및통계1·창업실습1 등은 교양 목록에도 실려 있지만 학과 소관 과목이다.)
 *  2. **계열 제외 영역** — 요건 세트의 영역별교양 버킷이 나열한 영역만 인정한다.
 *     소속 계열 영역(이공계=자연과 과학)의 과목은 영역별교양으로 집계하지 않고
 *     일반선택으로 돌린다. 과목은 그대로 보여주되 화면이 "영역별교양 미인정"을 붙인다.
 *  3. **제외 영역 목록을 코드에 두지 않는다** — 어떤 영역을 인정할지는 요건 세트
 *     JSON(area_liberal.areas)에서만 읽는다(CLAUDE.md 축 3). 계열별 제외 영역의
 *     근거 표는 교양_편제.md에 있고, 세트를 만들 때 그 표대로 areas를 채운다.
 */

import type { CatalogEntry, RequirementSet } from '../engine/types.js'
import { findFallbackBucketId } from '../engine/resolve.js'
import { normalizeText } from '../engine/normalize.js'
import { geCatalogByYear } from './index.js'

/** 다산학부대학 영역별교양 영역 이름. 세트에서 제외된 영역도 화면에 이름을 보여줘야 해서 여기 둔다. */
export const GE_AREA_LABEL: Record<string, string> = {
  hist_phil: '역사와 철학',
  lit_art: '문학과 예술',
  human_soc: '인간과 사회',
  nat_sci: '자연과 과학',
  conn_integ: '연결과 통합',
}

/** 교양 카탈로그를 보유한 학번. */
export const GE_CATALOG_YEARS = [2021, 2022, 2023, 2024, 2025, 2026] as const

const GE_YEAR_MIN = 2021
const GE_YEAR_MAX = 2026

/**
 * 학번 → 교양 카탈로그. 범위 밖 학번은 가장 가까운 해로 붙인다
 * (2020 이하 → 2021, 2027 이상 → 2026). 학번을 모르면 빈 배열이 아니라 최신 편제를
 * 주는 대신 null을 받는 쪽에서 판단하도록 undefined를 허용한다.
 */
export function geCatalogForYear(year: number | null | undefined): CatalogEntry[] {
  if (year == null || !Number.isFinite(year)) return []
  const clamped = Math.min(Math.max(Math.trunc(year), GE_YEAR_MIN), GE_YEAR_MAX)
  return geCatalogByYear[clamped] ?? []
}

/** 요건 세트가 인정하는 영역별교양 영역. 영역 스펙이 없으면 null(= 영역 제한 없음). */
export interface AreaPolicy {
  /** 영역별교양 버킷 id(보통 'area_liberal'). */
  bucketId: string
  /** 이 세트가 인정하는 영역 id 집합. */
  acceptedIds: Set<string>
}

/**
 * 세트에서 영역별교양 버킷을 찾는다 — areas를 선언한 첫 버킷(선언 순서, 결정론).
 * 버킷 id를 'area_liberal'로 가정하지 않는다(커스텀 세트는 id가 다를 수 있다).
 */
export function areaPolicyOf(set: RequirementSet): AreaPolicy | null {
  const bucket = set.buckets.find((b) => (b.areas?.length ?? 0) > 0)
  if (!bucket) return null
  return {
    bucketId: bucket.id,
    acceptedIds: new Set((bucket.areas ?? []).map((a) => a.id)),
  }
}

/**
 * 이 과목이 "제외 영역" 과목이면 그 영역 id, 아니면 null.
 * area 태그는 영역별교양 과목에만 붙으므로 태그 유무만 보면 된다.
 */
export function excludedAreaOf(
  entry: CatalogEntry | null | undefined,
  policy: AreaPolicy | null,
): string | null {
  if (!entry?.area || !policy) return null
  return policy.acceptedIds.has(entry.area) ? null : entry.area
}

/** 제외 영역 안내 문구용 영역 이름(모르는 id는 id 그대로). */
export function areaLabel(areaId: string): string {
  return GE_AREA_LABEL[areaId] ?? areaId
}

/**
 * 구버전(1단계) 임시 교양 과목. 실제 요람 과목이 아니라 엔진 픽스처에서 올라온 자리표시자였고,
 * 지금은 진짜 교양 카탈로그가 대신한다. 이미 저장해 둔 수강 기록이 조용히 미확인 과목이 되지
 * 않도록 `active:false`(검색 노출 금지)로만 남긴다 — 새로 고를 수는 없고, 옛 기록은 그대로 판정된다.
 */
export const LEGACY_GE_PLACEHOLDERS: CatalogEntry[] = [
  { courseKey: 'GE-AREA-HIST', name: '서양사의이해', credits: 3, defaultBucket: 'area_liberal', area: 'hist_phil' },
  { courseKey: 'GE-AREA-HIST-2', name: '동양철학산책', credits: 3, defaultBucket: 'area_liberal', area: 'hist_phil' },
  { courseKey: 'GE-AREA-HIST-3', name: '한국사탐구', credits: 3, defaultBucket: 'area_liberal', area: 'hist_phil' },
  { courseKey: 'GE-AREA-ART', name: '음악의이해', credits: 3, defaultBucket: 'area_liberal', area: 'lit_art' },
  { courseKey: 'GE-AREA-ART-2', name: '문학과영화', credits: 3, defaultBucket: 'area_liberal', area: 'lit_art' },
  { courseKey: 'GE-AREA-SOC', name: '사회학입문', credits: 3, defaultBucket: 'area_liberal', area: 'human_soc' },
  { courseKey: 'GE-AREA-SOC-2', name: '경제학의이해', credits: 3, defaultBucket: 'area_liberal', area: 'human_soc' },
].map((e) => ({
  ...e,
  active: false,
  note: '구버전 임시 과목 — 실제 교양 카탈로그로 대체됨. 기존 입력 보존용이라 검색에는 나오지 않는다.',
}))

/**
 * 교양 + 학과 카탈로그를 합친다.
 *
 * - courseKey 중복: 학과가 이긴다(학과 카탈로그가 그 과목의 정본).
 * - 과목명 중복: 학과가 이긴다. 교양 쪽 항목은 **버린다** — 남겨두면 자동완성에
 *   같은 이름이 두 개 뜨고, 이름으로 해석할 때 중복 후보(ambiguous)가 된다.
 * - 제외 영역 과목: defaultBucket을 일반선택으로 돌리고 note에 사유를 남긴다.
 *   area 태그는 지우지 않는다(화면이 "영역별교양 미인정"을 붙일 근거).
 */
export function mergeCatalogs(
  deptCatalog: CatalogEntry[],
  geCatalog: CatalogEntry[],
  set: RequirementSet | null,
): CatalogEntry[] {
  const deptKeys = new Set(deptCatalog.map((e) => e.courseKey))
  const deptNames = new Set(deptCatalog.map((e) => normalizeText(e.name)))
  const policy = set ? areaPolicyOf(set) : null
  const fallbackBucketId = set ? findFallbackBucketId(set) : undefined

  const out: CatalogEntry[] = [...deptCatalog]
  const seen = new Set(deptKeys)

  for (const entry of geCatalog) {
    if (seen.has(entry.courseKey) || deptNames.has(normalizeText(entry.name))) continue
    seen.add(entry.courseKey)
    out.push(applyAreaPolicy(entry, policy, fallbackBucketId))
  }

  // 옛 자리표시자는 맨 뒤에. 같은 키가 이미 있으면(있을 리 없지만) 건너뛴다.
  for (const entry of LEGACY_GE_PLACEHOLDERS) {
    if (seen.has(entry.courseKey)) continue
    seen.add(entry.courseKey)
    out.push(applyAreaPolicy(entry, policy, fallbackBucketId))
  }

  return out
}

/**
 * 제외 영역 과목을 일반선택으로 돌린다.
 * 일반선택 버킷이 없는 세트에서는 원본을 그대로 둔다(돌릴 곳이 없다).
 */
function applyAreaPolicy(
  entry: CatalogEntry,
  policy: AreaPolicy | null,
  fallbackBucketId: string | undefined,
): CatalogEntry {
  const excluded = excludedAreaOf(entry, policy)
  if (!excluded || !policy) return entry
  if (entry.defaultBucket !== policy.bucketId) return entry
  if (!fallbackBucketId) return entry
  const reason = `영역별교양 미인정 — ${areaLabel(excluded)}: 소속 계열 영역이라 일반선택으로 집계.`
  return {
    ...entry,
    defaultBucket: fallbackBucketId,
    note: entry.note ? `${reason} / ${entry.note}` : reason,
  }
}

/** 학번·요건 세트에 맞는 최종 카탈로그(학과 + 교양). */
export function catalogFor(
  deptCatalog: CatalogEntry[],
  admissionYear: number | null | undefined,
  set: RequirementSet | null,
): CatalogEntry[] {
  return mergeCatalogs(deptCatalog, geCatalogForYear(admissionYear), set)
}
