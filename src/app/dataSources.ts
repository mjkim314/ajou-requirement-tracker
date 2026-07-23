/**
 * 저장된 개인 상태(PersistedState) → 엔진 입력(EvaluationInput) 해석.
 *
 * 요건 세트는 커스텀 세트 → 번들 레지스트리 순으로 찾고, 카탈로그·추가전공 규칙은
 * 세트 id(또는 커스텀 세트가 복제한 원본 프리셋 id)로 번들을 고른다.
 * 요건 숫자는 전부 데이터에서 온다(하드코딩 없음).
 */

import type {
  AdditionalMajorRule,
  CatalogEntry,
  EvaluationInput,
  RequirementSet,
} from '../engine/index'
import {
  additionalMajorRules2021Sw,
  additionalMajorRules2022Sw,
  additionalMajorRules2023Sw,
  additionalMajorRules2024Sw,
  catalog2021Sw,
  catalog2022Sw,
  catalog2023Sw,
  catalog2024Sw,
  requirementSetRegistry,
} from '../data/index'
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
      if (year >= 2024) return BUNDLE_2024
      if (year >= 2023) return BUNDLE_2023
      if (year >= 2022) return BUNDLE_2022
    }
    return DEFAULT_BUNDLE
  }
  return EMPTY_BUNDLE
}

/** 프로필이 가리키는 요건 세트를 찾는다(커스텀 우선). */
export function resolveReqSet(state: PersistedState): RequirementSet | null {
  const id = state.profile?.requirementSetId
  if (!id) return null
  const custom = state.customSets.find((s) => s.id === id)
  if (custom) return custom
  return requirementSetRegistry[id] ?? null
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
    catalog: bundle.catalog,
    additionalMajorRules,
    nonCurricularState: state.noncurricular,
  }
}
