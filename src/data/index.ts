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
import catalog2025Json from './catalog-2025-sw.json'
import sets2025Json from './requirement-set-2025-sw.json'
import amr2025Json from './additional-major-rules-2025-sw.json'
import catalog2026Json from './catalog-2026-sw.json'
import sets2026Json from './requirement-set-2026-sw.json'
import amr2026Json from './additional-major-rules-2026-sw.json'

// 다산학부대학 교양 카탈로그(학번별). 전 학과가 공유하는 기반 데이터로,
// 아직 어떤 요건 세트도 참조하지 않으므로 DATA_BUNDLES·requirementSetRegistry에는
// 넣지 않는다. 학과 세트가 교양 courseKey를 쓰기 시작하면 그때 번들에 연결한다.
// 편제(영역·학점·계열 규칙)는 교양_편제.md 참조.
import catalog2021GeJson from './catalog-2021-ge.json'
import catalog2022GeJson from './catalog-2022-ge.json'
import catalog2023GeJson from './catalog-2023-ge.json'
import catalog2024GeJson from './catalog-2024-ge.json'
import catalog2025GeJson from './catalog-2025-ge.json'
import catalog2026GeJson from './catalog-2026-ge.json'

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

export const catalog2025Sw = catalog2025Json as unknown as CatalogEntry[]

const sets2025Sw = sets2025Json as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2025SwAdvanced = sets2025Sw.advanced
export const reqSet2025SwGeneral = sets2025Sw.general

export const additionalMajorRules2025Sw =
  amr2025Json as unknown as AdditionalMajorRule[]

export const catalog2026Sw = catalog2026Json as unknown as CatalogEntry[]

const sets2026Sw = sets2026Json as unknown as {
  advanced: RequirementSet
  general: RequirementSet
}
export const reqSet2026SwAdvanced = sets2026Sw.advanced
export const reqSet2026SwGeneral = sets2026Sw.general

export const additionalMajorRules2026Sw =
  amr2026Json as unknown as AdditionalMajorRule[]

export const catalog2021Ge = catalog2021GeJson as unknown as CatalogEntry[]
export const catalog2022Ge = catalog2022GeJson as unknown as CatalogEntry[]
export const catalog2023Ge = catalog2023GeJson as unknown as CatalogEntry[]
export const catalog2024Ge = catalog2024GeJson as unknown as CatalogEntry[]
export const catalog2025Ge = catalog2025GeJson as unknown as CatalogEntry[]
export const catalog2026Ge = catalog2026GeJson as unknown as CatalogEntry[]

/**
 * 학번 → 다산학부대학 교양 카탈로그.
 * 교양은 학과 무관 공통 기반이라 학과 카탈로그와 별도로 보관한다.
 * 2025학번부터 교양 편제가 크게 바뀌었다(영역 4→5개, 영어 6→3학점,
 * 아주상상프로젝트 3학점 신설, 영역별교양 전 계열 12학점).
 */
export const geCatalogByYear: Record<number, CatalogEntry[]> = {
  2021: catalog2021Ge,
  2022: catalog2022Ge,
  2023: catalog2023Ge,
  2024: catalog2024Ge,
  2025: catalog2025Ge,
  2026: catalog2026Ge,
}

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
  [reqSet2025SwAdvanced.id]: reqSet2025SwAdvanced,
  [reqSet2025SwGeneral.id]: reqSet2025SwGeneral,
  [reqSet2026SwAdvanced.id]: reqSet2026SwAdvanced,
  [reqSet2026SwGeneral.id]: reqSet2026SwGeneral,
}
