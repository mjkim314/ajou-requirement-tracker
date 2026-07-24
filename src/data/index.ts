/**
 * 번들 데이터의 유일한 import 표면.
 *
 * 실제 열거·등록은 파일명 규약 기반 매니페스트(manifest.ts)가 자동으로 한다 —
 * JSON 파일을 규약대로 추가하기만 하면 레지스트리·번들에 등록된다(R1, 손 등록 없음).
 * 여기서는 기존 소비처(테스트·앱) 호환을 위한 named export 를 매니페스트 조회로
 * 재구성해 유지한다.
 *
 * resolveJsonModule 은 JSON 리터럴 타입을 넓히므로(예: bucket.group 이 'free'가
 * 아니라 string 으로 추론) 컴파일 타입체크로는 구조 무결성을 보장하지 못한다.
 * 무결성 검증은 런타임 테스트(data-invariants·data-*.test.ts)가 담당한다.
 */

export {
  DATA_BUNDLES,
  DATASETS,
  MANIFEST_FILES,
  bundlesByDepartment,
  geCatalogByYear,
  geYears,
  requirementSetRegistry,
} from './manifest.js'
export type { DataBundle, Dataset, ManifestFile } from './manifest.js'

import { catalogOf, geCatalogOf, rulesOf, setOf } from './manifest.js'

// ── 소프트웨어융합대학 소프트웨어학과 (심화/일반) ──
export const catalog2021Sw = catalogOf(2021, 'sw')
export const reqSet2021SwAdvanced = setOf(2021, 'sw', 'advanced')
export const reqSet2021SwGeneral = setOf(2021, 'sw', 'general')
export const additionalMajorRules2021Sw = rulesOf(2021, 'sw')

export const catalog2022Sw = catalogOf(2022, 'sw')
export const reqSet2022SwAdvanced = setOf(2022, 'sw', 'advanced')
export const reqSet2022SwGeneral = setOf(2022, 'sw', 'general')
export const additionalMajorRules2022Sw = rulesOf(2022, 'sw')

export const catalog2023Sw = catalogOf(2023, 'sw')
export const reqSet2023SwAdvanced = setOf(2023, 'sw', 'advanced')
export const reqSet2023SwGeneral = setOf(2023, 'sw', 'general')
export const additionalMajorRules2023Sw = rulesOf(2023, 'sw')

export const catalog2024Sw = catalogOf(2024, 'sw')
export const reqSet2024SwAdvanced = setOf(2024, 'sw', 'advanced')
export const reqSet2024SwGeneral = setOf(2024, 'sw', 'general')
export const additionalMajorRules2024Sw = rulesOf(2024, 'sw')

export const catalog2025Sw = catalogOf(2025, 'sw')
export const reqSet2025SwAdvanced = setOf(2025, 'sw', 'advanced')
export const reqSet2025SwGeneral = setOf(2025, 'sw', 'general')
export const additionalMajorRules2025Sw = rulesOf(2025, 'sw')

export const catalog2026Sw = catalogOf(2026, 'sw')
export const reqSet2026SwAdvanced = setOf(2026, 'sw', 'advanced')
export const reqSet2026SwGeneral = setOf(2026, 'sw', 'general')
export const additionalMajorRules2026Sw = rulesOf(2026, 'sw')

// ── 공과대학 기계공학과 (공학인증/일반) ──
export const catalog2021Me = catalogOf(2021, 'me')
export const reqSet2021MeAccredited = setOf(2021, 'me', 'accredited')
export const reqSet2021MeGeneral = setOf(2021, 'me', 'general')
export const additionalMajorRules2021Me = rulesOf(2021, 'me')

export const catalog2022Me = catalogOf(2022, 'me')
export const reqSet2022MeAccredited = setOf(2022, 'me', 'accredited')
export const reqSet2022MeGeneral = setOf(2022, 'me', 'general')
export const additionalMajorRules2022Me = rulesOf(2022, 'me')

// ── 다산학부대학 교양 카탈로그 (학번별, 전 학과 공유) ──
export const catalog2021Ge = geCatalogOf(2021)
export const catalog2022Ge = geCatalogOf(2022)
export const catalog2023Ge = geCatalogOf(2023)
export const catalog2024Ge = geCatalogOf(2024)
export const catalog2025Ge = geCatalogOf(2025)
export const catalog2026Ge = geCatalogOf(2026)
