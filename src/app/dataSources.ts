/**
 * 저장된 개인 상태(PersistedState) → 엔진 입력(EvaluationInput) 해석.
 *
 * 요건 세트는 커스텀 세트 → 번들 레지스트리 순으로 찾고, 카탈로그·추가전공 규칙은
 * 세트 id(또는 커스텀 세트가 복제한 원본 프리셋 id)로 번들을 고른다.
 * 요건 숫자는 전부 데이터에서 온다(하드코딩 없음).
 */

import type {
  AdditionalMajorRule,
  Bucket,
  BucketGroup,
  CatalogEntry,
  EvaluationInput,
  RequirementSet,
} from '../engine/index'
import {
  additionalMajorRules2021Sw,
  additionalMajorRules2022Sw,
  additionalMajorRules2023Sw,
  additionalMajorRules2024Sw,
  additionalMajorRules2025Sw,
  additionalMajorRules2026Sw,
  catalog2021Sw,
  catalog2022Sw,
  catalog2023Sw,
  catalog2024Sw,
  catalog2025Sw,
  catalog2026Sw,
  requirementSetRegistry,
} from '../data/index'
import { catalogFor } from '../data/merge'
import type { PersistedState } from '../storage/schema'

interface DataBundle {
  catalog: CatalogEntry[]
  rules: AdditionalMajorRule[]
}

/** 요건 세트 id → 매칭 카탈로그·추가전공 규칙. */
const DATA_BUNDLES: Record<string, DataBundle> = {
  rs_2021_sw_advanced: { catalog: catalog2021Sw, rules: additionalMajorRules2021Sw },
  rs_2021_sw_general: { catalog: catalog2021Sw, rules: additionalMajorRules2021Sw },
  rs_2022_sw_advanced: { catalog: catalog2022Sw, rules: additionalMajorRules2022Sw },
  rs_2022_sw_general: { catalog: catalog2022Sw, rules: additionalMajorRules2022Sw },
  rs_2023_sw_advanced: { catalog: catalog2023Sw, rules: additionalMajorRules2023Sw },
  rs_2023_sw_general: { catalog: catalog2023Sw, rules: additionalMajorRules2023Sw },
  rs_2024_sw_advanced: { catalog: catalog2024Sw, rules: additionalMajorRules2024Sw },
  rs_2024_sw_general: { catalog: catalog2024Sw, rules: additionalMajorRules2024Sw },
  rs_2025_sw_advanced: { catalog: catalog2025Sw, rules: additionalMajorRules2025Sw },
  rs_2025_sw_general: { catalog: catalog2025Sw, rules: additionalMajorRules2025Sw },
  rs_2026_sw_advanced: { catalog: catalog2026Sw, rules: additionalMajorRules2026Sw },
  rs_2026_sw_general: { catalog: catalog2026Sw, rules: additionalMajorRules2026Sw },
}

/** 카탈로그를 보유한 학과(현재 SW뿐). 폴백은 이 학과의 세트일 때만 학번으로 고른다. */
const SW_DEPARTMENT = '소프트웨어학과'

/** SW 세트 학번 폴백용 기본 번들(2021). */
const DEFAULT_BUNDLE: DataBundle = { catalog: catalog2021Sw, rules: additionalMajorRules2021Sw }

/** 매칭 카탈로그가 없는 세트의 명시적 "카탈로그 미지정" 번들. */
const EMPTY_BUNDLE: DataBundle = { catalog: [], rules: [] }

/** 커스텀 세트가 복제 시 남긴 원본 프리셋 id. 온보딩 요건 확인에서 프리셋을 편집하면 채워진다. */
function basePresetId(set: RequirementSet): string | null {
  const v = set.source?.['basePresetId']
  return typeof v === 'string' ? v : null
}

const BUNDLE_2022: DataBundle = { catalog: catalog2022Sw, rules: additionalMajorRules2022Sw }
const BUNDLE_2023: DataBundle = { catalog: catalog2023Sw, rules: additionalMajorRules2023Sw }
const BUNDLE_2024: DataBundle = { catalog: catalog2024Sw, rules: additionalMajorRules2024Sw }
const BUNDLE_2025: DataBundle = { catalog: catalog2025Sw, rules: additionalMajorRules2025Sw }
const BUNDLE_2026: DataBundle = { catalog: catalog2026Sw, rules: additionalMajorRules2026Sw }

/**
 * 요건 세트가 쓸 카탈로그·추가전공 규칙 번들. 커스텀 세트는 원본 프리셋 번들로 되돌아간다.
 * 공유(JSON)로 들여온 세트는 source(basePresetId)가 화이트리스트에서 제거돼 없을 수 있어,
 * 마지막 폴백은 (학과, 학번) 기반: SW 세트(또는 학과 미기재 레거시)만 학번으로 카탈로그
 * 연도를 고르고, 다른 학과 세트에는 SW 카탈로그를 물려주지 않는다 — 전 과목 미매칭으로
 * 판정이 통째로 틀리는 것보다 빈 카탈로그(미지정)가 정직하다.
 */
export function bundleFor(set: RequirementSet): DataBundle {
  if (DATA_BUNDLES[set.id]) return DATA_BUNDLES[set.id]!
  const base = basePresetId(set)
  if (base && DATA_BUNDLES[base]) return DATA_BUNDLES[base]!
  if (set.department == null || set.department === SW_DEPARTMENT) {
    const year = set.admissionYearFrom
    if (year != null) {
      if (year >= 2026) return BUNDLE_2026
      if (year >= 2025) return BUNDLE_2025
      if (year >= 2024) return BUNDLE_2024
      if (year >= 2023) return BUNDLE_2023
      if (year >= 2022) return BUNDLE_2022
    }
    return DEFAULT_BUNDLE
  }
  return EMPTY_BUNDLE
}

// ────────────────────────────────────────────────────────────
// 학과 + 교양 카탈로그 합성
// ────────────────────────────────────────────────────────────

/**
 * 세트 객체 → (학번 → 합성 카탈로그) 캐시.
 *
 * 합성 자체는 순수 함수지만 매번 새 배열을 만들면 화면의 검색 인덱스(useMemo[catalog])가
 * 상태가 바뀔 때마다 300여 항목을 다시 색인한다. 세트 객체 동일성으로 캐시하면
 * 프리셋은 계속 같은 객체, 커스텀 세트는 편집될 때만 새 객체라 무효화가 정확하다.
 */
const mergedCatalogCache = new WeakMap<RequirementSet, Map<number, CatalogEntry[]>>()

/**
 * 요건 세트가 실제로 쓰는 카탈로그 — 학과 과목 + **학번에 맞는 다산학부대학 교양**.
 * 교양 영역 인정 범위(계열 제외 영역)는 세트의 영역별교양 버킷이 정한다(merge.ts).
 */
export function catalogForSet(
  set: RequirementSet,
  admissionYear: number | null | undefined,
): CatalogEntry[] {
  const year = admissionYear ?? set.admissionYearFrom ?? null
  const key = year ?? 0
  let byYear = mergedCatalogCache.get(set)
  if (!byYear) {
    byYear = new Map()
    mergedCatalogCache.set(set, byYear)
  }
  const hit = byYear.get(key)
  if (hit) return hit
  const merged = catalogFor(bundleFor(set).catalog, year, set)
  byYear.set(key, merged)
  return merged
}

/**
 * 구버전 영역 그룹 값을 현행 5분류로 정규화한다.
 * 온보딩 clone-on-edit 등으로 저장된 커스텀 세트에는 옛 'major'/'free'가 남아 있을 수 있는데,
 * 이를 두면 전공 평점(전공필수·전공선택 합집합)·일반선택 폴백이 조용히 어긋난다.
 * - 'major'  → 영역 id로 전공필수/전공선택 구분(임의 영역은 전공선택으로; 어느 쪽이든 전공 평점에 포함돼 결과 동일)
 * - 'free'   → 일반선택
 * 저장을 건드리지 않고 해석 시점에만 바로잡는다(변경 없으면 원본 참조 유지).
 */
function normalizeBucketGroup(b: Bucket): BucketGroup {
  const g = b.group as string
  if (g === 'major') return b.id === 'major_required' ? 'major_required' : 'major_elective'
  if (g === 'free') return 'general_elective'
  return b.group
}

export function normalizeReqSetGroups(set: RequirementSet): RequirementSet {
  let changed = false
  const buckets = set.buckets.map((b) => {
    const group = normalizeBucketGroup(b)
    if (group === b.group) return b
    changed = true
    return { ...b, group }
  })
  return changed ? { ...set, buckets } : set
}

/** 프로필이 가리키는 요건 세트를 찾는다(커스텀 우선). */
export function resolveReqSet(state: PersistedState): RequirementSet | null {
  const id = state.profile?.requirementSetId
  if (!id) return null
  const custom = state.customSets.find((s) => s.id === id)
  if (custom) return normalizeReqSetGroups(custom)
  const preset = requirementSetRegistry[id]
  return preset ? normalizeReqSetGroups(preset) : null
}

/**
 * 온보딩 "추가 전공" 단계가 보여줄 규칙 템플릿(복수전공·부전공·연계·트랙·마이크로 등).
 * 선택된 요건 세트(없으면 학번)에 맞는 번들의 규칙을 그대로 후보로 쓴다.
 */
export function additionalMajorTemplates(
  reqSet: RequirementSet | null,
  admissionYear?: number | null,
  department?: string | null,
): AdditionalMajorRule[] {
  if (reqSet) {
    const rules = bundleFor(reqSet).rules
    if (rules.length > 0) return rules
  }
  const year = admissionYear ?? reqSet?.admissionYearFrom ?? null
  const dept = department ?? reqSet?.department ?? null
  const base =
    year == null
      ? additionalMajorRules2021Sw
      : year >= 2026
        ? additionalMajorRules2026Sw
        : year >= 2025
          ? additionalMajorRules2025Sw
          : year >= 2024
            ? additionalMajorRules2024Sw
            : year >= 2023
              ? additionalMajorRules2023Sw
              : year >= 2022
                ? additionalMajorRules2022Sw
                : additionalMajorRules2021Sw
  // 연계전공 목록은 SW 참여분 — 다른 학과에는 전학교 공통 유형(복수·부·트랙 등)만 보여준다.
  if (dept != null && dept !== SW_DEPARTMENT) {
    return base.filter((r) => r.type !== 'linked_major')
  }
  return base
}

/** 개인 상태 → 엔진 입력. 프로필이나 요건 세트가 없으면 null(평가 불가). */
export function resolveInput(state: PersistedState): EvaluationInput | null {
  if (!state.profile) return null
  const requirementSet = resolveReqSet(state)
  if (!requirementSet) return null
  const bundle = bundleFor(requirementSet)

  // 프로필에 스냅샷된 추가전공 규칙(온보딩 편집값)을 번들 기본 규칙 뒤에 병합한다.
  // 엔진은 규칙 배열을 id로 맵핑하므로, 같은 id의 인라인 규칙이 기본값을 덮어쓴다.
  const inlineRules = state.profile.additionalMajors
    .map((am) => am.rule)
    .filter((r): r is AdditionalMajorRule => r != null)
  const additionalMajorRules =
    inlineRules.length > 0 ? [...bundle.rules, ...inlineRules] : bundle.rules

  return {
    profile: state.profile,
    courses: state.courses,
    requirementSet,
    // 학과 카탈로그 + 학번에 맞는 교양 카탈로그. 화면(자동완성·영역 편집기)도 이 값을 쓴다.
    catalog: catalogForSet(requirementSet, state.profile.admissionYear),
    additionalMajorRules,
    nonCurricularState: state.noncurricular,
  }
}
