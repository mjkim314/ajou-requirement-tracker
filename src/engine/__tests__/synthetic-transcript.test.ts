/**
 * R5 — 합성 성적표 판정 전이 테스트.
 *
 * DATASETS 매니페스트의 전 번들 × 전 트랙을 순회하며:
 *   1. 만점 성적표 → graduatable
 *   2. 전필 1개 제거 → not_graduatable
 *   3. 전필 1개를 enrolled로 → graduatable_after_current
 *
 * 신규 번들 추가 시 테스트 코드 0줄.
 * SW·ME 대표 수제 성적표(data.test.ts 등)와 독립.
 */

import { describe, it, expect } from 'vitest'
import { DATASETS } from '../../data/index.js'
import { evaluate } from '../index.js'
import { catalogFor } from '../../data/merge.js'
import { synthesizeGraduatable } from './synthetic-transcript.js'

for (const { year, slug, sets, bundle } of DATASETS) {
  for (const [track, set] of Object.entries(sets)) {
    const key = `${year}-${slug}-${track}`
    const mergedCatalog = catalogFor(bundle.catalog, year, set)

    describe(`합성 판정 ${key}`, () => {
      const synth = synthesizeGraduatable(set, mergedCatalog, bundle.rules, {
        admissionYear: year,
        trackType: track,
      })

      const baseInput = {
        profile: synth.profile,
        requirementSet: set,
        catalog: mergedCatalog,
        additionalMajorRules: bundle.rules,
        nonCurricularState: synth.nonCurricularState,
      }

      it('만점 성적표 → graduatable', () => {
        const r = evaluate({ ...baseInput, courses: synth.courses })
        expect(r.verdict, `${key} 만점 verdict`).toBe('graduatable')
        expect(r.credits.earned, `${key} earned >= totalCredits`).toBeGreaterThanOrEqual(set.totalCredits)
        expect(r.blockers, `${key} blocker 0`).toHaveLength(0)
      })

      it('전필 1개 제거 → not_graduatable', () => {
        // 전필이 있는 첫 번째 버킷에서 첫 과목을 제거
        const reqBucket = set.buckets.find((b) => (b.requiredCourses?.length ?? 0) > 0)
        if (!reqBucket) return // 전필이 없는 세트는 skip
        const removeKey = reqBucket.requiredCourses![0]

        const reduced = synth.courses.filter((c) => c.courseKey !== removeKey)
        const r = evaluate({ ...baseInput, courses: reduced })
        expect(r.verdict, `${key} 전필 제거 verdict`).toBe('not_graduatable')
      })

      it('전필 1개 수강중 전환 → graduatable_after_current', () => {
        const reqBucket = set.buckets.find((b) => (b.requiredCourses?.length ?? 0) > 0)
        if (!reqBucket) return
        const enrollKey = reqBucket.requiredCourses![0]

        const modified = synth.courses.map((c) =>
          c.courseKey === enrollKey
            ? { ...c, state: 'enrolled' as const, grade: null }
            : c,
        )
        const r = evaluate({ ...baseInput, courses: modified })
        expect(r.verdict, `${key} enrolled 전환 verdict`).toBe('graduatable_after_current')
      })
    })
  }
}
