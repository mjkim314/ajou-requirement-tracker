import type {
  AdditionalMajorRule,
  Bucket,
  CatalogEntry,
  Condition,
  Course,
  NonCurricularState,
  Profile,
  RequirementSet,
} from '../types.js'

export interface SyntheticResult {
  courses: Course[]
  profile: Profile
  nonCurricularState: NonCurricularState
}

function evaluateCondition(cond: Condition | null | undefined, profile: Profile): boolean {
  if (!cond) return true
  const actual = (profile as any)[cond.field]
  if (cond.op === 'eq') return actual === cond.value
  if (cond.op === 'neq') return actual !== cond.value
  return false
}

let seq = 0
function mkCourse(
  courseKey: string | null,
  nameSnapshot: string,
  credits: number,
  countsToward?: string[],
  bucketOverride?: string
): Course {
  seq++
  return {
    id: `synth-${seq}`,
    semester: '2024-1',
    courseKey,
    nameSnapshot,
    credits,
    state: 'completed',
    grade: 'A0',
    ...(countsToward ? { countsToward } : {}),
    ...(bucketOverride ? { bucketOverride } : {}),
  }
}

function getAssignedBucketId(
  c: { courseKey: string | null; bucketOverride?: string | null },
  set: RequirementSet,
  catalogMap: Map<string, CatalogEntry>
): string {
  if (c.bucketOverride) return c.bucketOverride
  if (!c.courseKey) return 'general_elective'

  const key = c.courseKey
  for (const b of set.buckets) {
    if (b.requiredCourses?.includes(key)) return b.id
  }
  for (const b of set.buckets) {
    if (b.choiceGroups?.some((g) => g.courses.includes(key))) return b.id
  }
  const entry = catalogMap.get(key)
  if (entry?.defaultBucket) {
    if (set.buckets.some((b) => b.id === entry.defaultBucket)) return entry.defaultBucket
  }
  return 'general_elective'
}

export function synthesizeGraduatable(
  set: RequirementSet,
  catalog: CatalogEntry[],
  additionalMajorRules: AdditionalMajorRule[],
  opts?: { admissionYear?: number; trackType?: string }
): SyntheticResult {
  seq = 0 // reset
  
  const catalogMap = new Map(catalog.map((e) => [e.courseKey, e]))
  
  const admissionYear = opts?.admissionYear ?? set.admissionYearFrom ?? 2021
  const trackType = opts?.trackType ?? set.trackType

  const profile: Profile = {
    schemaVersion: 2,
    admissionYear,
    college: set.college ?? '소프트웨어융합대학',
    department: set.department ?? '소프트웨어학과',
    trackType,
    requirementSetId: set.id,
    additionalMajors: [],
    exemptions: [],
    currentSemester: '2026-1',
    targetGraduation: '2026-2',
    onboardingCompleted: true,
  }

  const courses: Course[] = []
  const courseKeys = new Set<string>()
  const usedCodes = new Set<string>()
  const eqKeys = new Set(set.equivalents?.flatMap(e => [e.from, e.to]) ?? [])

  function addCourse(key: string, countsToward?: string[], bucketOverride?: string) {
    if (courseKeys.has(key)) return
    const entry = catalogMap.get(key)
    const credits = entry?.credits ?? 3
    const name = entry?.name ?? key
    
    courses.push(mkCourse(key, name, credits, countsToward, bucketOverride))
    courseKeys.add(key)
    if (entry && entry.codes) {
      for (const code of entry.codes) usedCodes.add(code)
    }
  }

  // 6. Additional major check early to add tags
  if (set.majorPolicy && set.majorPolicy.requiredWhen && evaluateCondition(set.majorPolicy.requiredWhen, profile)) {
    profile.additionalMajors.push({ ruleId: 'am_minor', active: true })
    for (let i = 0; i < 7; i++) {
      courses.push(mkCourse(null, `부전공${i + 1}`, 3, ['am_minor']))
    }
  }

  // Non-curricular first because courseGroupPick may dictate some courses
  const nonCurricularState: NonCurricularState = {}
  
  for (const req of set.nonCurricular) {
    if (!evaluateCondition(req.appliesWhen, profile)) continue
    
    if (req.type === 'check') {
      nonCurricularState[req.id] = { done: true }
    } else if (req.type === 'score') {
      nonCurricularState[req.id] = { score: Number(req.min ?? 100) }
    } else if (req.type === 'count') {
      nonCurricularState[req.id] = { count: Number(req.min ?? 1) }
    } else if (req.type === 'level') {
      nonCurricularState[req.id] = { level: String(req.min ?? 'IL') }
    } else if (req.type === 'alternatives' && req.alternatives?.length) {
      const alt = req.alternatives[0]!
      const altState: any = {}
      if (alt.type === 'check') altState.done = true
      else if (alt.type === 'score') altState.score = Number(alt.min ?? 100)
      else if (alt.type === 'level') altState.level = String(alt.min ?? 'IL')
      nonCurricularState[req.id] = { alternatives: { [alt.id]: altState } }
    } else if (req.type === 'courseGroupPick') {
      const pick = req.pick ?? 1
      const isCourseUnit = req.pickUnit === 'course'
      
      let pickedGroups = 0
      let pickedCourses = 0
      
      for (const group of req.groups ?? []) {
        if (!group.courses || group.courses.length === 0) continue
        
        if (isCourseUnit) {
          for (const c of group.courses) {
            if (pickedCourses < pick) {
              addCourse(c)
              pickedCourses++
            }
          }
        } else {
          if (pickedGroups < pick) {
            addCourse(group.courses[0]!)
            pickedGroups++
          }
        }
      }
      nonCurricularState[req.id] = { done: true }
    }
  }

  // 1-3. Fill buckets
  for (const bucket of set.buckets) {
    let bucketCredits = 0

    // requiredCourses
    for (const key of bucket.requiredCourses ?? []) {
      if (!courseKeys.has(key)) addCourse(key)
    }

    // choiceGroups
    for (const group of bucket.choiceGroups ?? []) {
      let picksLeft = group.pick
      for (const key of group.courses) {
        if (picksLeft <= 0) break
        if (!courseKeys.has(key)) addCourse(key)
        picksLeft--
      }
    }

    // Recalculate bucket credits
    bucketCredits = courses
      .filter((c) => getAssignedBucketId(c, set, catalogMap) === bucket.id)
      .reduce((sum, c) => sum + c.credits, 0)
    
    // minDistinctAreas for area_liberal or others
    if (bucket.minDistinctAreas) {
      const needed = bucket.minDistinctAreas
      const allowedAreas = new Set(bucket.areas?.map(a => a.id) ?? [])
      
      const currentAreas = new Set(
        courses
          .map(c => c.courseKey ? catalogMap.get(c.courseKey)?.area : null)
          .filter(Boolean)
      )
      
      let distCount = 0
      for (const area of currentAreas) {
        if (allowedAreas.has(area!)) distCount++
      }

      if (distCount < needed) {
        const candidates = catalog.filter(
          e => getAssignedBucketId({ courseKey: e.courseKey }, set, catalogMap) === bucket.id && e.area && allowedAreas.has(e.area) && !courseKeys.has(e.courseKey)
        )
        let candIdx = 0
        while (distCount < needed && candIdx < candidates.length) {
          const cand = candidates[candIdx]!
          const hasConflict = cand.codes?.some(code => usedCodes.has(code))
          if (!hasConflict && !currentAreas.has(cand.area!) && !eqKeys.has(cand.courseKey)) {
            addCourse(cand.courseKey)
            bucketCredits += cand.credits
            currentAreas.add(cand.area!)
            distCount++
          }
          candIdx++
        }
      }
    }

    // Fill remaining minCredits
    let minCredits = bucket.minCredits
    if (bucketCredits < minCredits) {
      // Find unused catalog courses matching defaultBucket
      const candidates = catalog.filter(
        (e) => getAssignedBucketId({ courseKey: e.courseKey }, set, catalogMap) === bucket.id && !courseKeys.has(e.courseKey)
      )
      let idx = 0
      while (bucketCredits < minCredits && idx < candidates.length) {
        const key = candidates[idx]!.courseKey
        const hasConflict = catalogMap.get(key)?.codes?.some(code => usedCodes.has(code))
        if (!hasConflict && !eqKeys.has(key)) {
          addCourse(key)
          bucketCredits += catalogMap.get(key)!.credits
        }
        idx++
      }

      // If still missing, use filler courses
      let fillerCount = 1
      while (bucketCredits < minCredits) {
        const fillerCredits = Math.min(3, minCredits - bucketCredits)
        const fillerName = `${bucket.shortLabel ?? bucket.label}채움${fillerCount++}`
        courses.push(mkCourse(null, fillerName, fillerCredits, undefined, bucket.id))
        bucketCredits += fillerCredits
      }
    }
  }

  // 4. Fill totalCredits gap
  const totalEarned = courses.reduce((sum, c) => sum + c.credits, 0)
  if (totalEarned < set.totalCredits) {
    let gap = set.totalCredits - totalEarned
    let fCount = 1
    while (gap > 0) {
      const c = Math.min(3, gap)
      courses.push(mkCourse(null, `일반채움${fCount++}`, c))
      gap -= c
    }
  }

  return { profile, courses, nonCurricularState }
}
