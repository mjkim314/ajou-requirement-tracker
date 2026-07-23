/**
 * 번들 데이터 로더 (2021 소프트웨어학과).
 *
 * JSON 프리셋·카탈로그를 엔진 타입으로 노출하는 유일한 import 표면.
 * resolveJsonModule은 JSON 리터럴 타입을 넓히므로(예: bucket.group이 'free'가
 * 아니라 string으로 추론) 컴파일 타입체크로는 구조 무결성을 보장하지 못한다.
 * 따라서 여기서는 `as unknown as`로만 캐스팅하고, 무결성 검증은
 * src/engine/__tests__/data.test.ts(런타임)가 담당한다.
 */

import type {
  AdditionalMajorRule,
  CatalogEntry,
  RequirementSet,
} from '../engine/types.js'

import catalogJson from './catalog-2021-sw.json'
import setsJson from './requirement-set-2021-sw.json'
import amrJson from './additional-major-rules-2021-sw.json'
import catalog2022Json from './catalog-2022-sw.json'
import sets2022Json from './requirement-set-2022-sw.json'
import amr2022Json from './additional-major-rules-2022-sw.json'
import catalog2023Json from './catalog-2023-sw.json'
import sets2023Json from './requirement-set-2023-sw.json'
import amr2023Json from './additional-major-rules-2023-sw.json'
import catalog2024Json from './catalog-2024-sw.json'
import sets2024Json from './requirement-set-2024-sw.json'
import amr2024Json from './additional-major-rules-2024-sw.json'

export const catalog2021Sw = catalogJson as unknown as CatalogEntry[]

const sets2021Sw = setsJson as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2021SwAdvanced = sets2021Sw.advanced
export const reqSet2021SwGeneral = sets2021Sw.general

export const additionalMajorRules2021Sw =
  amrJson as unknown as AdditionalMajorRule[]

export const catalog2022Sw = catalog2022Json as unknown as CatalogEntry[]

const sets2022Sw = sets2022Json as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2022SwAdvanced = sets2022Sw.advanced
export const reqSet2022SwGeneral = sets2022Sw.general

export const additionalMajorRules2022Sw =
  amr2022Json as unknown as AdditionalMajorRule[]

export const catalog2023Sw = catalog2023Json as unknown as CatalogEntry[]

const sets2023Sw = sets2023Json as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2023SwAdvanced = sets2023Sw.advanced
export const reqSet2023SwGeneral = sets2023Sw.general

export const additionalMajorRules2023Sw =
  amr2023Json as unknown as AdditionalMajorRule[]

export const catalog2024Sw = catalog2024Json as unknown as CatalogEntry[]

const sets2024Sw = sets2024Json as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2024SwAdvanced = sets2024Sw.advanced
export const reqSet2024SwGeneral = sets2024Sw.general

export const additionalMajorRules2024Sw =
  amr2024Json as unknown as AdditionalMajorRule[]

/** requirementSetId → 요건 세트. 프로필의 requirementSetId로 조회. */
export const requirementSetRegistry: Record<string, RequirementSet> = {
  [reqSet2021SwAdvanced.id]: reqSet2021SwAdvanced,
  [reqSet2021SwGeneral.id]: reqSet2021SwGeneral,
  [reqSet2022SwAdvanced.id]: reqSet2022SwAdvanced,
  [reqSet2022SwGeneral.id]: reqSet2022SwGeneral,
  [reqSet2023SwAdvanced.id]: reqSet2023SwAdvanced,
  [reqSet2023SwGeneral.id]: reqSet2023SwGeneral,
  [reqSet2024SwAdvanced.id]: reqSet2024SwAdvanced,
  [reqSet2024SwGeneral.id]: reqSet2024SwGeneral,
}
