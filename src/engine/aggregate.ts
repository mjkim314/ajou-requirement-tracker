/**
 * [4] Filter + [6] Aggregate — 상태 필터와 학점 집계·상한·이월.
 *
 * 순수 함수. 같은 로직으로 "현재" 컨텍스트와 "예정(수강중 포함)" 컨텍스트를 만든다.
 */

import { getBucket } from './resolve.js'
import type { CatalogEntry, Course, RequirementSet, ResolvedCourse } from './types.js'

// ────────────────────────────────────────────────────────────
// [4] 상태 필터
// ────────────────────────────────────────────────────────────

export interface StateFlags {
  countsForCredit: boolean
  countsForGPA: boolean
  /** '이번 학기 완료 예정' 판정 대상(수강중). */
  countsForProjection: boolean
}

/** 재수강으로 대체된 이전 기록 id 집합(다른 과목의 retakeOf가 가리키는 것). */
export function supersededIds(courses: Course[]): Set<string> {
  const set = new Set<string>()
  for (const c of courses) {
    if (c.retakeOf) set.add(c.retakeOf)
  }
  return set
}

export function stateFlags(course: Course, superseded: Set<string>): StateFlags {
  const none: StateFlags = {
    countsForCredit: false,
    countsForGPA: false,
    countsForProjection: false,
  }
  if (superseded.has(course.id)) return none // 이전 기록은 평점·학점 모두 제외

  switch (course.state) {
    case 'completed':
    case 'retake_planned': {
      // retake_planned은 이전 성적을 그대로 유지(설계명세서 5.7)
      const grade = course.grade
      if (grade === 'F') {
        return { countsForCredit: false, countsForGPA: true, countsForProjection: false }
      }
      if (grade === 'NP') return none
      if (grade === 'P' || course.isPassFail) {
        return { countsForCredit: true, countsForGPA: false, countsForProjection: true }
      }
      return { countsForCredit: true, countsForGPA: true, countsForProjection: true }
    }
    case 'transferred':
    case 'credited':
      // 학점은 포함, 평점은 제외
      return { countsForCredit: true, countsForGPA: false, countsForProjection: true }
    case 'enrolled':
      // 현재는 제외, '완료 예정' 판정에만 사용
      return { countsForCredit: false, countsForGPA: false, countsForProjection: true }
    case 'planned':
    case 'dropped':
    default:
      return none
  }
}

// ────────────────────────────────────────────────────────────
// [6] 집계 컨텍스트
// ────────────────────────────────────────────────────────────

export interface AggContext {
  /** 영역별 인정 학점(상한·이월 적용 후). */
  bucketEarned: Map<string, number>
  /** 총 이수학점(countsTowardTotal 영역만). */
  totalEarned: number
  /** 요건 매칭용 유효 키 합집합(requiredCourses 판정). */
  satisfiedKeys: Set<string>
  /** 포함 과목의 courseKey 집합(choiceGroup 소속 판정). */
  earnedCourseKeys: Set<string>
  /** 영역별교양: bucketId → (area → 서로 다른 과목 수). 귀속된 영역 기준으로만 센다. */
  areaCountsByBucket: Map<string, Map<string, number>>
  /** 이월로 발생한 경고 문구. */
  overflowWarnings: { shortText: string; detail: string }[]
  /** 암묵 이월 — 일반선택(free) 버킷 충족 계산에 합산되는 타 버킷 초과분. */
  implicitCarry: ImplicitCarry | null
}

/**
 * 암묵 이월(데이터_정정_백로그 #10).
 * 전 세트가 Σ버킷 minCredits = totalCredits 구조라, 한 영역을 초과 이수하면 그만큼
 * 일반선택이 비어 "일반선택 부족"으로 오판된다. 실제 학사처럼 초과분을 잔여 학점으로
 * 흡수시키되 bucketEarned·totalEarned는 건드리지 않는다 — checkBucket이 일반선택
 * 충족 계산에서만 합산한다.
 */
export interface ImplicitCarry {
  /** 이월을 받는 일반선택 버킷 id. */
  bucketId: string
  /** 합산 초과 학점 합계. */
  credits: number
  /** 출처 영역별 초과 학점(사유 문구용). */
  sources: { bucketId: string; label: string; credits: number }[]
}

/**
 * 포함 조건(include)에 맞는 과목만으로 집계 컨텍스트를 만든다.
 * - current: countsForCredit
 * - projected: countsForCredit || countsForProjection
 */
export function buildContext(
  resolved: ResolvedCourse[],
  reqSet: RequirementSet,
  index: Map<string, CatalogEntry>,
  include: (rc: ResolvedCourse) => boolean
): AggContext {
  const bucketEarned = new Map<string, number>()
  const satisfiedKeys = new Set<string>()
  const earnedCourseKeys = new Set<string>()
  // bucketId → (area → 과목 집합). 귀속된 영역 기준으로만 센다(override로 다른 영역에 간 과목은 제외).
  const areaSeenByBucket = new Map<string, Map<string, Set<string>>>()

  const included = resolved.filter(include)

  for (const rc of included) {
    bucketEarned.set(rc.bucketId, (bucketEarned.get(rc.bucketId) ?? 0) + rc.course.credits)
    for (const k of rc.effectiveKeys) satisfiedKeys.add(k)
    if (rc.courseKey) earnedCourseKeys.add(rc.courseKey)
    // 영역별교양 area 집계 — 이 과목이 실제로 귀속된 bucket 안에서만 센다
    const area = rc.catalog?.area
    if (area && rc.courseKey) {
      const perBucket = areaSeenByBucket.get(rc.bucketId) ?? new Map<string, Set<string>>()
      const s = perBucket.get(area) ?? new Set<string>()
      s.add(rc.courseKey)
      perBucket.set(area, s)
      areaSeenByBucket.set(rc.bucketId, perBucket)
    }
  }

  const overflowWarnings: { shortText: string; detail: string }[] = []

  // ── 요건 세트 과목군 상한·이월 (현장실습 등) ──
  for (const group of reqSet.courseGroups ?? []) {
    if (group.creditCap == null || !group.capBucket) continue
    const memberSet = new Set(group.courses)
    let groupSumInCapBucket = 0
    for (const rc of included) {
      if (rc.bucketId !== group.capBucket) continue
      const hit =
        (rc.courseKey && memberSet.has(rc.courseKey)) ||
        rc.effectiveKeys.some((k) => memberSet.has(k))
      if (hit) groupSumInCapBucket += rc.course.credits
    }
    const overflow = Math.max(0, groupSumInCapBucket - group.creditCap)
    if (overflow > 0 && group.overflowTo) {
      bucketEarned.set(
        group.capBucket,
        (bucketEarned.get(group.capBucket) ?? 0) - overflow
      )
      bucketEarned.set(
        group.overflowTo,
        (bucketEarned.get(group.overflowTo) ?? 0) + overflow
      )
      const capLabel = getBucket(reqSet, group.capBucket)?.label ?? group.capBucket
      overflowWarnings.push({
        shortText: `${overflow}학점 일반선택 이월`,
        detail: `${group.label}은(는) ${capLabel}(으)로 최대 ${group.creditCap}학점까지 인정됩니다. 초과 ${overflow}학점은 일반선택으로 이월됐습니다.`,
      })
    }
  }

  // ── 영역(Bucket) 자체 상한·이월 ──
  for (const bucket of reqSet.buckets) {
    if (bucket.creditCap == null || !bucket.overflowTo) continue
    const earned = bucketEarned.get(bucket.id) ?? 0
    const overflow = Math.max(0, earned - bucket.creditCap)
    if (overflow > 0) {
      bucketEarned.set(bucket.id, bucket.creditCap)
      bucketEarned.set(
        bucket.overflowTo,
        (bucketEarned.get(bucket.overflowTo) ?? 0) + overflow
      )
    }
  }

  // ── 암묵 이월 — 일반선택(free) 충족 계산용 ──
  // 명시 creditCap/overflowTo로 이동한 분은 위에서 이미 bucketEarned에서 빠져
  // 여기 초과분에 다시 잡히지 않는다(이중 계산 없음).
  const freeBucket = reqSet.buckets.find((b) => b.group === 'general_elective')
  let implicitCarry: ImplicitCarry | null = null
  if (freeBucket) {
    const sources: ImplicitCarry['sources'] = []
    for (const bucket of reqSet.buckets) {
      if (bucket.group === 'general_elective') continue
      // 총학점에 안 세는 영역의 초과분은 잔여 학점으로도 흐르지 않는다.
      if (bucket.countsTowardTotal === false) continue
      const excess = (bucketEarned.get(bucket.id) ?? 0) - bucket.minCredits
      if (excess > 0) sources.push({ bucketId: bucket.id, label: bucket.label, credits: excess })
    }
    if (sources.length > 0) {
      implicitCarry = {
        bucketId: freeBucket.id,
        credits: sources.reduce((s, x) => s + x.credits, 0),
        sources,
      }
    }
  }

  // ── 총 이수학점(countsTowardTotal 영역만) ──
  let totalEarned = 0
  for (const [bucketId, credits] of bucketEarned) {
    const bucket = getBucket(reqSet, bucketId)
    if (bucket && bucket.countsTowardTotal === false) continue
    totalEarned += credits
  }

  const areaCountsByBucket = new Map<string, Map<string, number>>()
  for (const [bid, perBucket] of areaSeenByBucket) {
    const counts = new Map<string, number>()
    for (const [area, set] of perBucket) counts.set(area, set.size)
    areaCountsByBucket.set(bid, counts)
  }

  return {
    bucketEarned,
    totalEarned,
    satisfiedKeys,
    earnedCourseKeys,
    areaCountsByBucket,
    overflowWarnings,
    implicitCarry,
  }
}

/** 수강중(enrolled) 학점 합계 — 진행 중 표시용. */
export function inProgressCredits(
  resolved: ResolvedCourse[]
): number {
  return resolved
    .filter((rc) => rc.course.state === 'enrolled')
    .reduce((sum, rc) => sum + rc.course.credits, 0)
}
