/**
 * evaluate — 계산 엔진 진입점.
 *
 * 설계명세서 7.1의 13단계 파이프라인을 순수 함수로 엮는다.
 * 인자로 받은 것만 사용한다. import한 전역 상태·Date.now()·localStorage 접근 없음.
 */

import {
  buildContext,
  inProgressCredits,
  stateFlags,
  supersededIds,
  type AggContext,
} from './aggregate.js'
import {
  checkAdditionalMajors,
  checkBucket,
  checkGPA,
  checkMajorPolicy,
  checkNonCurricular,
  checkRecognitionCaps,
} from './check.js'
import { buildCatalogIndex, normalizeCourse } from './normalize.js'
import {
  analyzeEquivalents,
  computeEffectiveKeys,
  findFallbackBucketId,
  pickBucket,
  resolveBucketCandidates,
} from './resolve.js'
import type {
  AdditionalMajorRule,
  Blocker,
  BucketResult,
  EvaluationInput,
  EvaluationResult,
  NonCurricularResult,
  ResolvedCourse,
  Verdict,
} from './types.js'

const VERDICT_LABEL: Record<Verdict, string> = {
  graduatable: '졸업 가능',
  graduatable_after_current: '이번 학기 완료 예정',
  not_graduatable: '졸업 불가',
}

export function evaluate(input: EvaluationInput): EvaluationResult {
  const {
    profile,
    courses,
    requirementSet: reqSet,
    catalog,
    additionalMajorRules = [],
    nonCurricularState = {},
  } = input

  // [1] Load / 인덱스 준비
  const index = buildCatalogIndex(catalog)
  const analysis = analyzeEquivalents(reqSet.equivalents ?? [], profile.admissionYear)
  const fallbackBucketId = findFallbackBucketId(reqSet)
  const superseded = supersededIds(courses)

  const diagnostics: EvaluationResult['diagnostics'] = {
    ambiguous: [],
    unmatched: [],
    equivalentCycles: analysis.cycleWarnings,
  }

  // [2]~[5] 정규화 · 대체 · 필터 · (귀속 후보 계산)
  interface Prelim {
    resolved: ResolvedCourse
    candidates: string[]
  }
  const prelims: Prelim[] = courses.map((course) => {
    const norm = normalizeCourse(
      { courseKey: course.courseKey, nameSnapshot: course.nameSnapshot },
      index
    )
    const courseKey = norm.courseKey
    if (norm.ambiguous) {
      diagnostics.ambiguous.push({
        courseId: course.id,
        input: course.courseKey ?? course.nameSnapshot,
        candidates: norm.candidates,
      })
    }
    if (norm.unmatched) {
      diagnostics.unmatched.push({
        courseId: course.id,
        input: course.courseKey ?? course.nameSnapshot,
      })
    }

    const eff = courseKey
      ? computeEffectiveKeys(courseKey, analysis)
      : { keys: [] as string[], viaEquivalent: false }
    const catalogEntry = courseKey ? index.byKey.get(courseKey) ?? null : null
    const flags = stateFlags(course, superseded)

    const cand = resolveBucketCandidates(
      {
        bucketOverride: course.bucketOverride,
        courseKey,
        effectiveKeys: eff.keys,
        catalog: catalogEntry,
      },
      reqSet,
      fallbackBucketId
    )

    const resolved: ResolvedCourse = {
      course,
      courseKey,
      effectiveKeys: eff.keys.length > 0 ? eff.keys : courseKey ? [courseKey] : [],
      catalog: catalogEntry,
      unmatched: norm.unmatched,
      viaEquivalent: eff.viaEquivalent,
      bucketId: '', // 아래 2-pass에서 확정
      resolutionPriority: cand.priority,
      countsForCredit: flags.countsForCredit,
      countsForGPA: flags.countsForGPA,
      countsForProjection: flags.countsForProjection,
      ...(norm.ambiguous ? { ambiguousCandidates: norm.candidates } : {}),
    }
    return { resolved, candidates: cand.candidates }
  })

  // 귀속 2-pass: 단일 후보 먼저 확정 → 동률 후보를 running 학점 기준으로 결정
  const runningEarned = new Map<string, number>()
  const assign = (p: Prelim, bucketId: string) => {
    p.resolved.bucketId = bucketId
    if (p.resolved.countsForCredit && bucketId) {
      runningEarned.set(bucketId, (runningEarned.get(bucketId) ?? 0) + p.resolved.course.credits)
    }
  }
  for (const p of prelims) {
    if (p.candidates.length === 1) assign(p, p.candidates[0]!)
    else if (p.candidates.length === 0) assign(p, fallbackBucketId ?? '')
  }
  for (const p of prelims) {
    if (p.candidates.length > 1) {
      assign(p, pickBucket(p.candidates, reqSet, runningEarned) ?? p.candidates[0]!)
    }
  }

  const resolved = prelims.map((p) => p.resolved)

  // [6] 집계 — 현재 / 예정(수강중 포함) 두 컨텍스트
  const current = buildContext(resolved, reqSet, index.byKey, (rc) => rc.countsForCredit)
  const projected = buildContext(
    resolved,
    reqSet,
    index.byKey,
    (rc) => rc.countsForCredit || rc.countsForProjection
  )

  // [7]~[11] 판정 (현재)
  const bucketChecks = reqSet.buckets.map((b) => checkBucket(b, current, index.byKey))
  const bucketResults = bucketChecks.map((c) => c.result)
  const bucketWarnings = bucketChecks.flatMap((c) => c.warnings)

  const gpa = checkGPA(resolved, reqSet)
  const nonCurr = checkNonCurricular(
    reqSet,
    nonCurricularState,
    profile,
    current.satisfiedKeys,
    current.earnedCourseGroups
  )

  const rulesMap: Record<string, AdditionalMajorRule> = {}
  for (const r of additionalMajorRules) rulesMap[r.id] = r
  const additionalMajors = checkAdditionalMajors(profile, rulesMap, resolved)
  const majorPolicy = checkMajorPolicy(reqSet.majorPolicy, profile, additionalMajors)

  // 예정 컨텍스트 재판정(각 축이 수강중 과목으로 해소되는지 확인 → severity/verdict용)
  const projBucketSatisfied = new Map<string, boolean>()
  for (const b of reqSet.buckets) {
    projBucketSatisfied.set(b.id, checkBucket(b, projected, index.byKey).result.satisfied)
  }
  const projNonCurr = checkNonCurricular(
    reqSet,
    nonCurricularState,
    profile,
    projected.satisfiedKeys,
    projected.earnedCourseGroups
  )
  // 전공 이수원칙도 수강중 과목 포함으로 재판정(이번 학기 추가전공 완성 케이스)
  const projAdditional = checkAdditionalMajors(
    profile,
    rulesMap,
    resolved,
    (rc) => rc.countsForCredit || rc.countsForProjection
  )
  const projMajorPolicy = checkMajorPolicy(reqSet.majorPolicy, profile, projAdditional)
  const projNonCurrOK = (id: string) =>
    projNonCurr.find((r) => r.id === id)?.satisfied ?? true

  // [12] Verdict
  const totalOK = current.totalEarned + 1e-9 >= reqSet.totalCredits
  const bucketsOK = bucketResults.every((b) => b.satisfied)
  const nonCurrOK = nonCurr.every((r) => !r.active || r.satisfied)
  const graduatable = totalOK && bucketsOK && gpa.satisfied && nonCurrOK && majorPolicy.satisfied

  const projTotalOK = projected.totalEarned + 1e-9 >= reqSet.totalCredits
  const projBucketsOK = reqSet.buckets.every((b) => projBucketSatisfied.get(b.id))
  const projNonCurrAllOK = nonCurr.every((r) => !r.active || projNonCurrOK(r.id))
  const graduatableAfter =
    !graduatable &&
    projTotalOK &&
    projBucketsOK &&
    gpa.satisfied &&
    projNonCurrAllOK &&
    projMajorPolicy.satisfied

  const verdict: Verdict = graduatable
    ? 'graduatable'
    : graduatableAfter
      ? 'graduatable_after_current'
      : 'not_graduatable'

  // [13] blocker / warning / plan
  const inProgress = inProgressCredits(resolved)
  const earned = current.totalEarned
  const required = reqSet.totalCredits
  const remaining = Math.max(0, required - earned)

  const blockers = buildBlockers({
    reqSet,
    current,
    totalOK,
    projTotalOK,
    remaining,
    bucketResults,
    bucketChecks,
    projBucketSatisfied,
    gpa,
    nonCurr,
    projNonCurrOK,
    majorPolicy,
    catalogByKey: index.byKey,
  })

  const warnings: Blocker[] = [
    ...[...current.overflowWarnings, ...bucketWarnings].map((w) => ({
      severity: 'warning' as const,
      category: 'warning',
      shortText: w.shortText,
      detail: w.detail,
    })),
    ...checkRecognitionCaps(reqSet, resolved),
  ]

  const plan = buildPlan(remaining, profile.currentSemester, profile.targetGraduation)

  const completionRate = required > 0 ? Math.min(earned / required, 1) : 1

  return {
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    completionRate,
    completionLabel: `${Math.round(completionRate * 100)}% 완료`,
    credits: {
      earned,
      required,
      remaining,
      inProgress,
      projected: earned + inProgress,
    },
    gpa,
    buckets: bucketResults,
    nonCurricular: nonCurr,
    additionalMajors,
    majorPolicy,
    blockers,
    warnings,
    plan,
    resolved,
    diagnostics,
  }
}

// ────────────────────────────────────────────────────────────
// blocker 생성
// ────────────────────────────────────────────────────────────

interface BlockerCtx {
  reqSet: EvaluationInput['requirementSet']
  current: AggContext
  totalOK: boolean
  projTotalOK: boolean
  remaining: number
  bucketResults: BucketResult[]
  bucketChecks: { result: BucketResult }[]
  projBucketSatisfied: Map<string, boolean>
  gpa: EvaluationResult['gpa']
  nonCurr: NonCurricularResult[]
  projNonCurrOK: (id: string) => boolean
  majorPolicy: EvaluationResult['majorPolicy']
  catalogByKey: Map<string, import('./types.js').CatalogEntry>
}

function buildBlockers(c: BlockerCtx): Blocker[] {
  const out: Blocker[] = []
  const sev = (resolvedInProjected: boolean): Blocker['severity'] =>
    resolvedInProjected ? 'pending' : 'blocking'

  // 총 이수학점
  if (!c.totalOK) {
    out.push({
      severity: sev(c.projTotalOK),
      category: 'total_credits',
      shortText: `${c.remaining}학점 부족`,
      detail: `총 이수학점이 ${c.reqSet.totalCredits}학점에 ${c.remaining}학점 모자랍니다.`,
      actionHint: '과목 추가하기',
      resolvableThisSemester: c.projTotalOK,
      creditsToResolve: c.remaining,
    })
  }

  // 영역별
  for (const b of c.bucketResults) {
    if (b.satisfied) continue
    const bucketDef = c.reqSet.buckets.find((x) => x.id === b.id)!
    // 암묵 이월분(carriedIn)은 이미 이 영역 충족 계산에 합산돼 있다 — 부족분에서 뺀다.
    const short = Math.max(0, b.required - b.earned - b.carriedIn)
    const resolvedProj = c.projBucketSatisfied.get(b.id) ?? false
    const name = bucketDef.shortLabel ?? b.label

    if (b.missingCourses.length > 0) {
      out.push({
        severity: sev(resolvedProj),
        category: 'required_course',
        shortText: `${name} ${b.missingCourses.length}과목 부족`,
        detail: `${b.missingCourses.join(', ')} 이수가 필요합니다.`,
        bucketId: b.id,
        actionHint: '과목 추가하기',
        resolvableThisSemester: resolvedProj,
        creditsToResolve: short,
      })
    } else if (short > 0) {
      out.push({
        severity: sev(resolvedProj),
        category: 'bucket_credits',
        shortText: `${name} ${short}학점 부족`,
        detail: `${b.label} 영역이 ${b.required}학점 중 ${b.earned}학점입니다.`,
        bucketId: b.id,
        actionHint: '과목 추가하기',
        resolvableThisSemester: resolvedProj,
        creditsToResolve: short,
      })
    } else {
      // 택1·영역 미충족 등 (학점은 충족)
      out.push({
        severity: sev(resolvedProj),
        category: 'bucket_rule',
        shortText: `${name} 조건 미충족`,
        detail: b.reasons.join(' / ') || `${b.label} 세부 조건을 확인하세요.`,
        bucketId: b.id,
        actionHint: '과목 확인하기',
        resolvableThisSemester: resolvedProj,
        creditsToResolve: 0,
      })
    }
  }

  // 평점
  if (!c.gpa.satisfied) {
    out.push({
      severity: 'blocking',
      category: 'gpa',
      shortText: '평점 미달',
      detail: `누계 평점 ${c.gpa.overall.toFixed(2)}이(가) 기준 ${c.gpa.minRequired.toFixed(1)}에 미달합니다.`,
      actionHint: '재수강 검토',
      resolvableThisSemester: false,
      creditsToResolve: 0,
    })
  }

  // 비교과
  for (const r of c.nonCurr) {
    if (!r.active || r.satisfied) continue
    const reqDef = c.reqSet.nonCurricular.find((x) => x.id === r.id)
    const name = reqDef?.shortLabel ?? r.label
    const resolvedProj = c.projNonCurrOK(r.id)
    out.push({
      severity: sev(resolvedProj),
      category: 'non_curricular',
      shortText: `${name} 미완료`,
      detail: `${r.label} 요건을 충족해야 합니다.`,
      requirementId: r.id,
      actionHint: '점수 입력하기',
      resolvableThisSemester: resolvedProj,
      creditsToResolve: 0,
    })
  }

  // 전공 이수원칙
  if (c.majorPolicy.required && !c.majorPolicy.satisfied) {
    out.push({
      severity: 'blocking',
      category: 'major_policy',
      shortText: '복수/부전공 미이수',
      detail: '일반과정은 복수전공 또는 부전공을 1건 이상 이수해야 합니다.',
      actionHint: '추가 전공 등록',
      resolvableThisSemester: false,
      creditsToResolve: 0,
    })
  }

  // 정렬: blocking → pending → warning → info, 동일 severity 내 해소 학점 적은 순
  const rank: Record<Blocker['severity'], number> = {
    blocking: 0,
    pending: 1,
    warning: 2,
    info: 3,
  }
  return out.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity]
    return (a.creditsToResolve ?? 0) - (b.creditsToResolve ?? 0)
  })
}

// ────────────────────────────────────────────────────────────
// 남은 학기 배분
// ────────────────────────────────────────────────────────────

function semesterOrdinal(sem: string | undefined): number | null {
  if (!sem) return null
  const m = sem.match(/^(\d{4})-([12S])$/)
  if (!m) return null
  const year = Number(m[1])
  // 정규 학기만 카운트(계절학기 S는 앞 학기와 같은 위치로 취급)
  const slot = m[2] === '2' ? 1 : 0
  return year * 2 + slot
}

function buildPlan(
  remainingCredits: number,
  currentSemester: string | undefined,
  targetGraduation: string | undefined
): EvaluationResult['plan'] {
  const cur = semesterOrdinal(currentSemester)
  const tgt = semesterOrdinal(targetGraduation)
  let remainingSemesters = 0
  if (cur != null && tgt != null) remainingSemesters = Math.max(0, tgt - cur)

  const perSemester =
    remainingSemesters > 0
      ? Math.ceil(remainingCredits / remainingSemesters)
      : remainingCredits
  return {
    remainingCredits,
    remainingSemesters,
    perSemester,
    overloaded: perSemester > 18,
  }
}
