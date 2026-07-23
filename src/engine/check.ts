/**
 * [7~11] 판정 — 영역·평점·비교과·추가전공·전공 이수원칙.
 * 순수 함수. 모든 기준값은 인자로 받은 요건 세트에서 읽는다.
 */

import { getBucket } from './resolve.js'
import type { AggContext } from './aggregate.js'
import type {
  AdditionalMajorResult,
  Blocker,
  Bucket,
  BucketResult,
  CatalogEntry,
  Condition,
  GradePointTable,
  MajorPolicy,
  NonCurricularResult,
  NonCurricularState,
  Profile,
  Requirement,
  RequirementAlternative,
  RequirementSet,
  ResolvedCourse,
} from './types.js'

const EPS = 1e-9

/** 4.5 만점 기본 평점표(요건 세트에 gradePoints가 없을 때만 사용). */
export const DEFAULT_GRADE_POINTS: GradePointTable = {
  'A+': 4.5,
  A0: 4.0,
  'B+': 3.5,
  B0: 3.0,
  'C+': 2.5,
  C0: 2.0,
  'D+': 1.5,
  D0: 1.0,
  F: 0,
}

// ────────────────────────────────────────────────────────────
// 공통 헬퍼
// ────────────────────────────────────────────────────────────

export function evalCondition(cond: Condition | null | undefined, profile: Profile): boolean {
  if (!cond) return true
  const actual = (profile as unknown as Record<string, unknown>)[cond.field]
  if (cond.op === 'eq') return actual === cond.value
  if (cond.op === 'neq') return actual !== cond.value
  return false
}

/** 등급 스케일 인덱스 비교(OPIc·TOEIC Speaking). */
export function scaleIndex(scale: string[] | undefined, value: string | number | undefined): number {
  if (!scale || value == null) return -1
  return scale.indexOf(String(value))
}

/**
 * 상한 이내에서 합계를 최대화하는 부분합(설계명세서 7.3).
 * 큰 것부터 담는 그리디는 손해(4·3·3, 상한 6 → 3+3=6이 정답).
 */
export function subsetSumMax(values: number[], cap: number): number {
  if (cap <= 0) return 0
  // 정수 학점 가정. 도달 가능한 합 집합을 DP로 구한다.
  const reachable = new Set<number>([0])
  for (const v of values) {
    if (v <= 0) continue
    for (const s of [...reachable]) {
      const next = s + v
      if (next <= cap) reachable.add(next)
    }
  }
  return Math.max(...reachable)
}

// ────────────────────────────────────────────────────────────
// [7] CheckBucket
// ────────────────────────────────────────────────────────────

export interface BucketCheck {
  result: BucketResult
  warnings: { shortText: string; detail: string }[]
}

export function checkBucket(
  bucket: Bucket,
  ctx: AggContext,
  catalogByKey: Map<string, CatalogEntry>
): BucketCheck {
  const earned = ctx.bucketEarned.get(bucket.id) ?? 0
  const required = bucket.minCredits
  const reasons: string[] = []
  const warnings: { shortText: string; detail: string }[] = []

  const creditOK = earned + EPS >= required

  // 지정 필수 과목
  const missingKeys = (bucket.requiredCourses ?? []).filter(
    (key) => !ctx.satisfiedKeys.has(key)
  )
  const missingCourses = missingKeys.map((k) => catalogByKey.get(k)?.name ?? k)
  const requiredOK = missingKeys.length === 0

  // 택1(택N) 그룹
  let choiceOK = true
  for (const group of bucket.choiceGroups ?? []) {
    const pickedIdx = group.courses
      .map((c, i) => (ctx.satisfiedKeys.has(c) ? i : -1))
      .filter((i) => i >= 0)
    if (pickedIdx.length < group.pick) {
      choiceOK = false
      reasons.push(`택1 그룹 미이수: ${group.label}`)
      continue
    }
    // linkedTo 연동 정합(예: 물리학 ↔ 물리학실험). 위치 인덱스로 짝을 맞춘다.
    if (group.linkedTo) {
      const target = (bucket.choiceGroups ?? []).find((g) => g.id === group.linkedTo)
      if (target) {
        const targetIdx = target.courses
          .map((c, i) => (ctx.satisfiedKeys.has(c) ? i : -1))
          .filter((i) => i >= 0)
        const consistent = pickedIdx.some((i) => targetIdx.includes(i))
        if (targetIdx.length > 0 && !consistent) {
          warnings.push({
            shortText: '실험 짝 불일치',
            detail: `${group.label}의 선택이 ${target.label} 선택과 연동되지 않습니다. 요람의 실험 짝 조건을 확인하세요.`,
          })
        }
      }
    }
  }

  // 서로 다른 영역 최소 개수(영역별교양)
  let areaOK = true
  if (bucket.minDistinctAreas != null && bucket.minDistinctAreas > 0) {
    const areas = bucket.areas ?? []
    const areaCounts = ctx.areaCountsByBucket.get(bucket.id) ?? new Map<string, number>()
    const distinct = areas.filter(
      (a) => (areaCounts.get(a.id) ?? 0) >= a.minCourses
    ).length
    areaOK = distinct >= bucket.minDistinctAreas
    if (!areaOK) {
      reasons.push(
        `서로 다른 ${bucket.minDistinctAreas}개 영역 필요 (현재 ${distinct}개)`
      )
    }
  }

  if (!creditOK) reasons.push(`${(required - earned).toFixed(0)}학점 부족`)
  if (!requiredOK) reasons.push(`필수 과목 ${missingKeys.length}개 미이수`)

  const satisfied = creditOK && requiredOK && choiceOK && areaOK

  return {
    result: {
      id: bucket.id,
      label: bucket.label,
      group: bucket.group,
      earned,
      required,
      rate: required > 0 ? Math.min(earned / required, 1) : 1,
      satisfied,
      missingCourses,
      reasons,
    },
    warnings,
  }
}

// ────────────────────────────────────────────────────────────
// [8] CheckGPA
// ────────────────────────────────────────────────────────────

export interface GpaResult {
  overall: number
  major: number
  minRequired: number
  satisfied: boolean
}

export function checkGPA(
  resolved: ResolvedCourse[],
  reqSet: RequirementSet
): GpaResult {
  const table = reqSet.gradePoints ?? DEFAULT_GRADE_POINTS
  const majorBucketIds = new Set(
    reqSet.buckets.filter((b) => b.group === 'major').map((b) => b.id)
  )

  let allPoints = 0
  let allCredits = 0
  let majPoints = 0
  let majCredits = 0

  for (const rc of resolved) {
    if (!rc.countsForGPA) continue
    const grade = rc.course.grade
    if (grade == null) continue
    const point = table[grade]
    if (point == null) continue
    const credits = rc.course.credits
    allPoints += point * credits
    allCredits += credits
    if (majorBucketIds.has(rc.bucketId)) {
      majPoints += point * credits
      majCredits += credits
    }
  }

  // 판정은 미반올림 값으로(예: 실제 1.995를 2.00으로 올려 오충족하지 않도록).
  const overallRaw = allCredits > 0 ? allPoints / allCredits : 0
  const majorRaw = majCredits > 0 ? majPoints / majCredits : 0
  return {
    overall: round2(overallRaw), // 표시용만 반올림
    major: round2(majorRaw),
    minRequired: reqSet.minGPA,
    satisfied: overallRaw + EPS >= reqSet.minGPA,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ────────────────────────────────────────────────────────────
// [9] CheckNonCurricular
// ────────────────────────────────────────────────────────────

export function checkNonCurricular(
  reqSet: RequirementSet,
  state: NonCurricularState,
  profile: Profile,
  earnedCourseKeys: Set<string>
): NonCurricularResult[] {
  return reqSet.nonCurricular.map((req) => {
    const active = evalCondition(req.appliesWhen, profile)
    if (!active) {
      return {
        id: req.id,
        label: req.label,
        active: false,
        satisfied: true, // 비활성 항목은 blocker가 아니다
        detail: '해당 과정에 적용되지 않는 항목입니다.',
      }
    }
    const st = state[req.id] ?? {}
    const satisfied = evalRequirement(req, st, earnedCourseKeys)
    return {
      id: req.id,
      label: req.label,
      active: true,
      satisfied,
      detail: satisfied ? '충족' : '미충족',
    }
  })
}

function evalRequirement(
  req: Requirement,
  st: NonCurricularState[string],
  earnedCourseKeys: Set<string>
): boolean {
  switch (req.type) {
    case 'check':
      return st.done === true
    case 'score':
      return typeof st.score === 'number' && typeof req.min === 'number'
        ? st.score + EPS >= req.min
        : false
    case 'count':
      return typeof st.count === 'number' && typeof req.min === 'number'
        ? st.count >= req.min
        : false
    case 'level': {
      // 스케일이 없거나 기준 등급이 스케일 밖이면 판정 불가 → 미충족.
      // (둘 다 -1이 되어 -1>=-1로 "무입력 충족"이 새는 것을 막는다.)
      const target = scaleIndex(req.scale, req.min as string)
      return target >= 0 && scaleIndex(req.scale, st.level) >= target
    }
    case 'alternatives': {
      const pick = req.pick ?? 1
      let satisfiedCount = 0
      for (const alt of req.alternatives ?? []) {
        if (evalAlternative(alt, st.alternatives?.[alt.id] ?? {})) satisfiedCount++
      }
      return satisfiedCount >= pick
    }
    case 'courseGroupPick': {
      const pick = req.pick ?? 1
      let groupsHit = 0
      for (const group of req.groups ?? []) {
        if (group.courses.some((c) => earnedCourseKeys.has(c))) groupsHit++
      }
      return groupsHit >= pick
    }
    default:
      return false
  }
}

function evalAlternative(
  alt: RequirementAlternative,
  st: { done?: boolean; score?: number; level?: string }
): boolean {
  switch (alt.type) {
    case 'check':
      return st.done === true
    case 'score':
      return typeof st.score === 'number' && typeof alt.min === 'number'
        ? st.score + EPS >= alt.min
        : false
    case 'level': {
      const target = scaleIndex(alt.scale, alt.min as string)
      return target >= 0 && scaleIndex(alt.scale, st.level) >= target
    }
    default:
      return false
  }
}

// ────────────────────────────────────────────────────────────
// [10] CheckAdditional (다중 전공 · 중복 인정 상한)
// ────────────────────────────────────────────────────────────

export function checkAdditionalMajors(
  profile: Profile,
  rules: Record<string, import('./types.js').AdditionalMajorRule>,
  resolved: ResolvedCourse[],
  /** 집계 대상 필터. 기본은 이수 완료분. 예정 판정 시 수강중 포함으로 넘긴다. */
  include: (rc: ResolvedCourse) => boolean = (rc) => rc.countsForCredit
): AdditionalMajorResult[] {
  const results: AdditionalMajorResult[] = []
  const counting = resolved.filter(include)

  for (const am of profile.additionalMajors) {
    if (!am.active) continue
    const rule = rules[am.ruleId]
    if (!rule) continue

    // 이 전공으로 인정되는 과목: countsToward에 ruleId 또는 type이 들어간 것
    const tagged = counting.filter((rc) => {
      const tags = rc.course.countsToward ?? []
      return tags.includes(rule.id) || tags.includes(rule.type)
    })

    // 제1전공과 중복되는 과목(countsToward에 'primary'도 포함) → 상한 적용 대상
    const overlap = tagged.filter((rc) => (rc.course.countsToward ?? []).includes('primary'))
    const nonOverlap = tagged.filter((rc) => !(rc.course.countsToward ?? []).includes('primary'))

    const recognizedOverlap = subsetSumMax(
      overlap.map((rc) => rc.course.credits),
      rule.homeOverlapCap
    )
    const nonOverlapSum = nonOverlap.reduce((s, rc) => s + rc.course.credits, 0)
    const earned = recognizedOverlap + nonOverlapSum

    // 과목군별 진행(표시용). primary_group 등은 creditCap으로 상한.
    const groupProgress = (rule.courseGroups ?? []).map((g) => {
      const inGroup = tagged.filter((rc) =>
        (rc.catalog?.courseGroups ?? []).includes(g.id)
      )
      const raw = inGroup.reduce((s, rc) => s + rc.course.credits, 0)
      const capped = g.creditCap != null ? Math.min(raw, g.creditCap) : raw
      return { id: g.id, label: g.label, earned: capped, required: g.minCredits }
    })

    const groupsOK = groupProgress.every((g) => g.earned + EPS >= g.required)
    const requiredOK = (rule.requiredCourses ?? []).every((k) =>
      counting.some((rc) => rc.effectiveKeys.includes(k))
    )
    const satisfied =
      earned + EPS >= rule.totalMinCredits && groupsOK && requiredOK

    results.push({
      id: rule.id,
      name: rule.name,
      typeLabel: rule.typeLabel,
      earned,
      required: rule.totalMinCredits,
      satisfied,
      satisfiesMajorPolicy: rule.satisfiesMajorPolicy,
      groupProgress,
    })
  }
  return results
}

// ────────────────────────────────────────────────────────────
// [11] CheckMajorPolicy
// ────────────────────────────────────────────────────────────

export interface MajorPolicyResult {
  satisfied: boolean
  required: boolean
  reason: string
}

export function checkMajorPolicy(
  policy: MajorPolicy | undefined,
  profile: Profile,
  additionalMajors: AdditionalMajorResult[]
): MajorPolicyResult {
  if (!policy) return { satisfied: true, required: false, reason: '전공 이수원칙 없음' }

  const required = evalCondition(policy.requiredWhen, profile)
  if (!required) {
    return { satisfied: true, required: false, reason: '심화과정 등으로 추가 전공 불필요' }
  }

  const exemptionHit = profile.exemptions.some((e) => policy.exemptions.includes(e))
  if (exemptionHit) {
    return { satisfied: true, required: true, reason: '예외 사항으로 면제' }
  }

  const completeSatisfying = additionalMajors.filter(
    (r) => r.satisfiesMajorPolicy && r.satisfied
  ).length
  const satisfied = completeSatisfying >= policy.minAdditionalMajorCount

  return {
    satisfied,
    required: true,
    reason: satisfied
      ? '복수/부전공 이수로 충족'
      : '복수/부전공 등 추가 전공 이수 필요',
  }
}

// ────────────────────────────────────────────────────────────
// 인정학점 상한 (recognitionCaps)
// ────────────────────────────────────────────────────────────

/**
 * 인정학점(교환·현장실습·입학 전 이수 등) 합산 상한 검사.
 * 초과는 경고(warning)로만 알린다 — 실제 인정 여부는 학교 판단이라 verdict에 반영하지 않는다.
 * 유형별 세부 상한은 과목 상태로 구분할 수 없어, 세트가 정의한 상태 집합의 합산만 본다.
 */
export function checkRecognitionCaps(
  reqSet: RequirementSet,
  resolved: ResolvedCourse[]
): Blocker[] {
  const out: Blocker[] = []
  for (const cap of reqSet.recognitionCaps ?? []) {
    const states = new Set(cap.states)
    const sum = resolved
      .filter((rc) => rc.countsForCredit && states.has(rc.course.state))
      .reduce((acc, rc) => acc + rc.course.credits, 0)

    const limits: number[] = []
    if (cap.maxCredits != null) limits.push(cap.maxCredits)
    if (cap.maxRatioOfTotal != null) limits.push(cap.maxRatioOfTotal * reqSet.totalCredits)
    if (limits.length === 0) continue
    const limit = Math.round(Math.min(...limits) * 10) / 10

    if (sum > limit + EPS) {
      out.push({
        severity: 'warning',
        category: 'recognition_cap',
        requirementId: cap.id,
        shortText: `${cap.label} 초과`,
        detail: `${cap.label}: 인정 학점 ${sum}학점이 상한 ${limit}학점을 넘어요. 초과분은 졸업학점으로 인정되지 않을 수 있어요.`,
      })
    }
  }
  return out
}

// blocker 문구 유틸은 evaluate에서 사용한다.
export type { Blocker }
