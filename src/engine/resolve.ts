/**
 * [3] Substitute + [5] Resolve — 대체 규칙 적용과 영역 귀속 결정.
 *
 * 귀속 우선순위(설계명세서 7.2):
 *   1 사용자 bucketOverride
 *   2 요건 세트 requiredCourses (직접 키)
 *   3 요건 세트 choiceGroups (직접 키)
 *   4 대체 규칙(equivalents)으로 도달한 requiredCourses/choiceGroups
 *   5 카탈로그 defaultBucket
 *   6 폴백 → 일반선택(group === 'free')
 *
 * 동률(2~4순위에서 여러 영역 지목): minCredits 미달 영역 우선 → buckets 선언 순서.
 * 순수 함수 — 결정론적 출력을 보장한다.
 */

import type {
  Bucket,
  CatalogEntry,
  EquivalentCourse,
  RequirementSet,
} from './types.js'

// ────────────────────────────────────────────────────────────
// 대체 규칙 (Substitute)
// ────────────────────────────────────────────────────────────

interface Edge {
  to: string
  ruleId: string
}

export interface EquivalentAnalysis {
  adjacency: Map<string, Edge[]>
  /** 순환에 걸린 노드(원본만 유지). */
  cycleNodes: Set<string>
  cycleWarnings: string[]
}

/**
 * equivalents를 그래프로 만들고 순환을 검출한다.
 * - 단일 bidirectional 규칙의 왕복(같은 ruleId 역방향)은 순환이 아니다(정상 상호 인정).
 * - 서로 다른 규칙이 만드는 방향 순환(A→B, B→A)이나 자기참조는 순환으로 표시한다.
 */
export function analyzeEquivalents(
  equivalents: EquivalentCourse[] = [],
  admissionYear = 0
): EquivalentAnalysis {
  const adjacency = new Map<string, Edge[]>()
  const addEdge = (from: string, to: string, ruleId: string) => {
    const list = adjacency.get(from)
    if (list) list.push({ to, ruleId })
    else adjacency.set(from, [{ to, ruleId }])
  }

  for (const eq of equivalents) {
    // effectiveFrom이 있으면 해당 학번 이후에만 적용
    if (eq.effectiveFrom != null && admissionYear < eq.effectiveFrom) continue
    addEdge(eq.from, eq.to, eq.id)
    if (eq.direction === 'bidirectional') addEdge(eq.to, eq.from, eq.id)
  }

  const cycleNodes = new Set<string>()
  const cycleWarnings: string[] = []
  const color = new Map<string, 'gray' | 'black'>()

  const dfs = (node: string, parent: string | null, parentRule: string | null) => {
    color.set(node, 'gray')
    for (const edge of adjacency.get(node) ?? []) {
      // 방금 지나온 단일 bidirectional 규칙의 역방향은 무시
      if (edge.to === parent && edge.ruleId === parentRule) continue
      const c = color.get(edge.to)
      if (c === 'gray') {
        cycleNodes.add(node)
        cycleNodes.add(edge.to)
        cycleWarnings.push(`대체 규칙 순환 감지: ${edge.to} ↔ ${node} (원본 유지)`)
      } else if (c === undefined) {
        dfs(edge.to, node, edge.ruleId)
      }
    }
    color.set(node, 'black')
  }

  for (const node of adjacency.keys()) {
    if (!color.has(node)) dfs(node, null, null)
  }

  return { adjacency, cycleNodes, cycleWarnings }
}

/**
 * courseKey가 요건 매칭에 쓸 수 있는 유효 키 집합을 만든다.
 * 자기 자신 + 대체 규칙으로 3홉 이내 도달 가능한 키. 순환 노드는 원본만 반환.
 */
export function computeEffectiveKeys(
  courseKey: string,
  analysis: EquivalentAnalysis,
  maxHops = 3
): { keys: string[]; viaEquivalent: boolean } {
  if (analysis.cycleNodes.has(courseKey)) {
    return { keys: [courseKey], viaEquivalent: false }
  }
  const keys = [courseKey]
  const visited = new Set([courseKey])
  let frontier = [courseKey]
  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      for (const edge of analysis.adjacency.get(node) ?? []) {
        if (analysis.cycleNodes.has(edge.to) || visited.has(edge.to)) continue
        visited.add(edge.to)
        keys.push(edge.to)
        next.push(edge.to)
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return { keys, viaEquivalent: keys.length > 1 }
}

// ────────────────────────────────────────────────────────────
// 영역 귀속 (Resolve)
// ────────────────────────────────────────────────────────────

export interface BucketCandidate {
  /** 귀속 우선순위(1~6). */
  priority: number
  /** 동일 우선순위 후보 영역 ID 목록. */
  candidates: string[]
}

/** group === 'free'인 첫 영역을 일반선택 폴백으로 쓴다(선언 순서 기준, 결정론). */
export function findFallbackBucketId(reqSet: RequirementSet): string | undefined {
  return reqSet.buckets.find((b) => b.group === 'free')?.id
}

/** 하나의 과목에 대해 우선순위별 후보 영역을 계산한다. */
export function resolveBucketCandidates(
  opts: {
    bucketOverride?: string | null
    courseKey: string | null
    effectiveKeys: string[]
    catalog: CatalogEntry | null
  },
  reqSet: RequirementSet,
  fallbackBucketId: string | undefined
): BucketCandidate {
  const { bucketOverride, courseKey, effectiveKeys, catalog } = opts
  const bucketIds = new Set(reqSet.buckets.map((b) => b.id))

  // 1순위: 사용자 지정
  if (bucketOverride && bucketIds.has(bucketOverride)) {
    return { priority: 1, candidates: [bucketOverride] }
  }

  // 2순위: requiredCourses 직접 키
  if (courseKey) {
    const p2 = reqSet.buckets
      .filter((b) => (b.requiredCourses ?? []).includes(courseKey))
      .map((b) => b.id)
    if (p2.length > 0) return { priority: 2, candidates: p2 }

    // 3순위: choiceGroups 직접 키
    const p3 = reqSet.buckets
      .filter((b) =>
        (b.choiceGroups ?? []).some((g) => g.courses.includes(courseKey))
      )
      .map((b) => b.id)
    if (p3.length > 0) return { priority: 3, candidates: p3 }
  }

  // 4순위: 대체 규칙으로 도달한 키 (자기 키 제외)
  const equivKeys = effectiveKeys.filter((k) => k !== courseKey)
  if (equivKeys.length > 0) {
    const p4 = reqSet.buckets
      .filter(
        (b) =>
          equivKeys.some((k) => (b.requiredCourses ?? []).includes(k)) ||
          (b.choiceGroups ?? []).some((g) =>
            equivKeys.some((k) => g.courses.includes(k))
          )
      )
      .map((b) => b.id)
    if (p4.length > 0) return { priority: 4, candidates: p4 }
  }

  // 5순위: 카탈로그 defaultBucket
  if (catalog && bucketIds.has(catalog.defaultBucket)) {
    return { priority: 5, candidates: [catalog.defaultBucket] }
  }

  // 6순위: 폴백(일반선택)
  if (fallbackBucketId) {
    return { priority: 6, candidates: [fallbackBucketId] }
  }
  return { priority: 6, candidates: [] }
}

/**
 * 동률 후보 중 하나를 고른다.
 * minCredits 미달 영역 우선 → buckets 선언 순서(결정론).
 */
export function pickBucket(
  candidates: string[],
  reqSet: RequirementSet,
  runningEarned: Map<string, number>
): string | undefined {
  if (candidates.length <= 1) return candidates[0]
  const order = new Map(reqSet.buckets.map((b, i) => [b.id, i]))
  const byId = new Map(reqSet.buckets.map((b) => [b.id, b]))
  const sorted = [...candidates].sort((a, b) => {
    const ba = byId.get(a)
    const bb = byId.get(b)
    const underA = (runningEarned.get(a) ?? 0) < (ba?.minCredits ?? 0) ? 0 : 1
    const underB = (runningEarned.get(b) ?? 0) < (bb?.minCredits ?? 0) ? 0 : 1
    if (underA !== underB) return underA - underB // 미달(0) 우선
    return (order.get(a) ?? 0) - (order.get(b) ?? 0) // 선언 순서
  })
  return sorted[0]
}

export function getBucket(reqSet: RequirementSet, id: string): Bucket | undefined {
  return reqSet.buckets.find((b) => b.id === id)
}
