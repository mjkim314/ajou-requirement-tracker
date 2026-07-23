import { describe, expect, it } from 'vitest'
import {
  additionalStepValid,
  admissionYearOptions,
  baseReqSet,
  buildCommit,
  buildEmptyReqSet,
  departmentHasPreset,
  draftToRule,
  emptyDraft,
  findPresetId,
  hasReqEdits,
  majorPolicyWarning,
  makeAdditionalMajorDraft,
  presetOptions,
  profileStepValid,
  reqsetStepValid,
  requiresAdditionalMajor,
  gradeSemesterLabel,
  semesterLabel,
  semesterOptions,
  type OnboardingDraft,
} from './model'
import { additionalMajorRules2021Sw, catalog2022Sw, requirementSetRegistry } from '../../data/index'
import { bundleFor, resolveInput, resolveReqSet } from '../dataSources'
import { emptyPersistedState, type PersistedState } from '../../storage/schema'
import { evaluate } from '../../engine/index'

const NOW = '2026-07-22T00:00:00.000Z'

function draftFor(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return { ...emptyDraft(), ...overrides }
}

/** commit 결과를 저장 상태로 환원(온보딩이 AppState에서 하는 것과 동일). */
function stateFromCommit(draft: OnboardingDraft): PersistedState {
  const commit = buildCommit(draft, requirementSetRegistry, NOW)
  return { ...emptyPersistedState(), profile: commit.profile, customSets: commit.customSets }
}

describe('프리셋 조회', () => {
  it('SW 2021 심화/일반, 2022를 학번·학과·과정으로 찾는다', () => {
    expect(findPresetId(requirementSetRegistry, 2021, '소프트웨어학과', 'advanced')).toBe(
      'rs_2021_sw_advanced',
    )
    expect(findPresetId(requirementSetRegistry, 2021, '소프트웨어학과', 'general')).toBe(
      'rs_2021_sw_general',
    )
    expect(findPresetId(requirementSetRegistry, 2022, '소프트웨어학과', 'advanced')).toBe(
      'rs_2022_sw_advanced',
    )
  })

  it('프리셋 없는 조합(공학인증/타 학과/타 학번)은 null', () => {
    expect(findPresetId(requirementSetRegistry, 2021, '소프트웨어학과', 'accredited')).toBeNull()
    expect(findPresetId(requirementSetRegistry, 2021, '미디어학과', 'advanced')).toBeNull()
    expect(findPresetId(requirementSetRegistry, 2019, '소프트웨어학과', 'advanced')).toBeNull()
  })

  it('departmentHasPreset — 학과에 프리셋 존재 여부', () => {
    expect(departmentHasPreset(requirementSetRegistry, 2021, '소프트웨어학과')).toBe(true)
    expect(departmentHasPreset(requirementSetRegistry, 2021, '미디어학과')).toBe(false)
    expect(departmentHasPreset(requirementSetRegistry, null, '소프트웨어학과')).toBe(true)
  })

  it('presetOptions는 레지스트리 8종을 노출(2021~2024 × 심화/일반)', () => {
    expect(presetOptions(requirementSetRegistry)).toHaveLength(8)
  })
})

describe('단계 검증', () => {
  it('내 정보: 학번·학과·과정 모두 필요', () => {
    expect(profileStepValid(draftFor())).toBe(false)
    expect(
      profileStepValid(
        draftFor({ admissionYear: 2021, department: '소프트웨어학과', trackType: 'advanced' }),
      ),
    ).toBe(true)
  })

  it('요건 세트: 선택 필요', () => {
    expect(reqsetStepValid(draftFor())).toBe(false)
    expect(reqsetStepValid(draftFor({ reqset: { kind: 'empty' } }))).toBe(true)
  })

  it('추가 전공: 일반과정은 1건 이상 강제, 심화는 자유', () => {
    expect(additionalStepValid(draftFor({ trackType: 'general' }), null)).toBe(false)
    expect(additionalStepValid(draftFor({ trackType: 'advanced' }), null)).toBe(true)
    const am = makeAdditionalMajorDraft(additionalMajorRules2021Sw[0]!, 'am-1')
    expect(
      additionalStepValid(draftFor({ trackType: 'general', additionalMajors: [am] }), null),
    ).toBe(true)
  })

  it('requiresAdditionalMajor — majorPolicy.requiredWhen(neq advanced)을 데이터로 평가', () => {
    const generalPreset = requirementSetRegistry['rs_2021_sw_general']!
    // 심화: 강제 아님(majorPolicy가 있어도 requiredWhen=neq advanced → false)
    expect(requiresAdditionalMajor(draftFor({ trackType: 'advanced' }), generalPreset)).toBe(false)
    // 공학인증 + majorPolicy 보유 세트: 엔진과 동일하게 강제(neq advanced → true)
    expect(requiresAdditionalMajor(draftFor({ trackType: 'accredited' }), generalPreset)).toBe(true)
    // 공학인증 + majorPolicy 없는 빈 세트: 강제 아님
    expect(requiresAdditionalMajor(draftFor({ trackType: 'accredited' }), null)).toBe(false)
    // 일반: 빈 세트여도 항상 강제
    expect(requiresAdditionalMajor(draftFor({ trackType: 'general' }), null)).toBe(true)
  })

  it('majorPolicyWarning — 강제 대상이 충족 못하는 유형만 고르면 경고', () => {
    const general = requirementSetRegistry['rs_2021_sw_general']!
    const track = makeAdditionalMajorDraft(
      additionalMajorRules2021Sw.find((r) => r.id === 'am_track')!,
      'am-1',
    )
    expect(
      majorPolicyWarning(draftFor({ trackType: 'general', additionalMajors: [track] }), general),
    ).not.toBeNull()
    const dbl = makeAdditionalMajorDraft(
      additionalMajorRules2021Sw.find((r) => r.id === 'am_double')!,
      'am-2',
    )
    expect(
      majorPolicyWarning(draftFor({ trackType: 'general', additionalMajors: [dbl] }), general),
    ).toBeNull()
  })
})

describe('추가 전공 draft ↔ rule', () => {
  it('draftToRule의 id는 instanceId(프로필 ruleId와 일치)', () => {
    const d = makeAdditionalMajorDraft(additionalMajorRules2021Sw[0]!, 'inst-42')
    const rule = draftToRule({ ...d, totalMinCredits: 30, homeOverlapCap: 5 })
    expect(rule.id).toBe('inst-42')
    expect(rule.totalMinCredits).toBe(30)
    expect(rule.homeOverlapCap).toBe(5)
  })
})

describe('요건 편집 감지', () => {
  const base = requirementSetRegistry['rs_2021_sw_advanced']!
  it('편집 없으면 false', () => {
    expect(hasReqEdits(base, { totalCredits: null, minGPA: null, bucketMinCredits: {} })).toBe(false)
    expect(
      hasReqEdits(base, {
        totalCredits: base.totalCredits,
        minGPA: base.minGPA,
        bucketMinCredits: {},
      }),
    ).toBe(false)
  })
  it('총학점·평점·영역학점 변경 감지', () => {
    expect(hasReqEdits(base, { totalCredits: 130, minGPA: null, bucketMinCredits: {} })).toBe(true)
    expect(hasReqEdits(base, { totalCredits: null, minGPA: 2.3, bucketMinCredits: {} })).toBe(true)
    expect(
      hasReqEdits(base, { totalCredits: null, minGPA: null, bucketMinCredits: { major_elective: 40 } }),
    ).toBe(true)
  })
})

describe('buildCommit — 프리셋 경로', () => {
  it('편집 없으면 프리셋 id를 그대로 쓰고 커스텀 세트 없음', () => {
    const commit = buildCommit(
      draftFor({
        admissionYear: 2021,
        department: '소프트웨어학과',
        college: '소프트웨어융합대학',
        trackType: 'advanced',
        reqset: { kind: 'preset', presetId: 'rs_2021_sw_advanced' },
      }),
      requirementSetRegistry,
      NOW,
    )
    expect(commit.profile.requirementSetId).toBe('rs_2021_sw_advanced')
    expect(commit.customSets).toHaveLength(0)
    expect(commit.profile.onboardingCompleted).toBe(true)
  })

  it('편집하면 프리셋을 복제한 커스텀 세트로 분기(source.basePresetId 유지)', () => {
    const commit = buildCommit(
      draftFor({
        admissionYear: 2021,
        department: '소프트웨어학과',
        trackType: 'advanced',
        reqset: { kind: 'preset', presetId: 'rs_2021_sw_advanced' },
        reqEdits: { totalCredits: 130, minGPA: null, bucketMinCredits: {} },
      }),
      requirementSetRegistry,
      NOW,
    )
    expect(commit.customSets).toHaveLength(1)
    const set = commit.customSets[0]!
    expect(commit.profile.requirementSetId).toBe(set.id)
    expect(set.id).toBe('rs_2021_sw_advanced__custom')
    expect(set.totalCredits).toBe(130)
    expect(set.source?.['basePresetId']).toBe('rs_2021_sw_advanced')
  })
})

describe('buildCommit — 빈 세트 경로', () => {
  it('영역 없는 커스텀 세트 + 프로필 생성', () => {
    const draft = draftFor({
      admissionYear: 2020,
      college: '자연과학대학',
      department: '수학과',
      departmentSlug: 'math',
      trackType: 'advanced',
      reqset: { kind: 'empty' },
      reqEdits: { totalCredits: 132, minGPA: 2.0, bucketMinCredits: {} },
    })
    const commit = buildCommit(draft, requirementSetRegistry, NOW)
    expect(commit.customSets).toHaveLength(1)
    const set = commit.customSets[0]!
    expect(set.buckets).toHaveLength(0)
    expect(set.totalCredits).toBe(132)
    expect(set.source?.['verified']).toBe(false)
    expect(commit.profile.department).toBe('수학과')
    expect(commit.profile.requirementSetId).toBe(set.id)
  })

  it('buildEmptyReqSet은 학번·slug로 안정적 id를 만든다', () => {
    const set = buildEmptyReqSet(
      draftFor({ admissionYear: 2020, departmentSlug: 'math', trackType: 'general' }),
      NOW,
    )
    expect(set.id).toBe('rs_2020_math_general_custom')
  })

  it('baseReqSet은 빈 세트에서 null(기준 영역 없음)', () => {
    expect(baseReqSet(draftFor({ reqset: { kind: 'empty' } }), requirementSetRegistry)).toBeNull()
    expect(
      baseReqSet(
        draftFor({ reqset: { kind: 'preset', presetId: 'rs_2021_sw_advanced' } }),
        requirementSetRegistry,
      ),
    ).not.toBeNull()
  })
})

describe('엔진 라운드트립 — 온보딩 결과가 실제로 평가된다', () => {
  it('프리셋 심화: 과목 0건이어도 evaluate가 결과를 낸다', () => {
    const state = stateFromCommit(
      draftFor({
        admissionYear: 2021,
        department: '소프트웨어학과',
        trackType: 'advanced',
        reqset: { kind: 'preset', presetId: 'rs_2021_sw_advanced' },
      }),
    )
    expect(resolveReqSet(state)).not.toBeNull()
    const input = resolveInput(state)
    expect(input).not.toBeNull()
    const result = evaluate(input!)
    expect(result.credits.required).toBe(140)
    expect(result.verdict).toBe('not_graduatable') // 과목 0건
  })

  it('일반과정 + 복수전공(편집): 인라인 규칙이 엔진 입력에 병합된다', () => {
    const am = makeAdditionalMajorDraft(
      additionalMajorRules2021Sw.find((r) => r.id === 'am_double')!,
      'inst-double',
    )
    const state = stateFromCommit(
      draftFor({
        admissionYear: 2021,
        department: '소프트웨어학과',
        trackType: 'general',
        reqset: { kind: 'preset', presetId: 'rs_2021_sw_general' },
        additionalMajors: [{ ...am, totalMinCredits: 33 }],
      }),
    )
    const input = resolveInput(state)!
    const merged = input.additionalMajorRules!.find((r) => r.id === 'inst-double')
    expect(merged).toBeDefined()
    expect(merged!.totalMinCredits).toBe(33)
    const result = evaluate(input)
    // 일반과정 + 미완성 추가전공 → 전공이수원칙 미충족이 반영되어야 한다
    expect(result.majorPolicy.required).toBe(true)
    expect(result.additionalMajors.map((a) => a.id)).toContain('inst-double')
  })

  it('빈 세트: 총학점 기준으로 evaluate가 죽지 않는다', () => {
    const state = stateFromCommit(
      draftFor({
        admissionYear: 2020,
        college: '자연과학대학',
        department: '수학과',
        departmentSlug: 'math',
        trackType: 'advanced',
        reqset: { kind: 'empty' },
        reqEdits: { totalCredits: 132, minGPA: 2.0, bucketMinCredits: {} },
      }),
    )
    const input = resolveInput(state)!
    const result = evaluate(input)
    expect(result.credits.required).toBe(132)
    expect(result.buckets).toHaveLength(0)
  })
})

describe('리뷰 반영 — 회귀 방지', () => {
  it('직접 입력 학과(slug 없음)의 빈 세트 id는 학과별로 고유하고 결정적', () => {
    const mk = (dept: string) =>
      buildEmptyReqSet(
        draftFor({ admissionYear: 2020, department: dept, departmentSlug: null, trackType: 'advanced' }),
        NOW,
      ).id
    const a = mk('가상학과A')
    const b = mk('가상학과B')
    expect(a).not.toBe(b)
    expect(mk('가상학과A')).toBe(a)
  })

  it('공유 세트(source 없는 2022 클론)는 학번으로 2022 카탈로그 번들에 매핑', () => {
    const base = requirementSetRegistry['rs_2022_sw_advanced']!
    const shared = { ...base, id: 'rs_2022_sw_advanced__custom', source: undefined }
    expect(bundleFor(shared).catalog).toBe(catalog2022Sw)
  })
})

describe('화면 보조값', () => {
  it('admissionYearOptions는 내림차순', () => {
    const ys = admissionYearOptions(2026, 3)
    expect(ys).toEqual([2026, 2025, 2024])
  })
  it('semesterOptions / semesterLabel', () => {
    expect(semesterOptions(2021, 1)).toEqual(['2021-1', '2021-2'])
    expect(semesterLabel('2021-2')).toBe('2021년 2학기')
  })
  it('gradeSemesterLabel — 입학연도 기준 학년 환산', () => {
    // 2021 입학: 2021-1=1학년 1학기, 2023-2=3학년 2학기
    expect(gradeSemesterLabel('2021-1', 2021)).toBe('1학년 1학기')
    expect(gradeSemesterLabel('2023-2', 2021)).toBe('3학년 2학기')
    // 입학연도 없으면 연도 라벨로 폴백
    expect(gradeSemesterLabel('2023-2', null)).toBe('2023년 2학기')
    // 학년이 1 미만(입학 전 학기)이면 연도 라벨로 폴백
    expect(gradeSemesterLabel('2020-1', 2021)).toBe('2020년 1학기')
  })
})
