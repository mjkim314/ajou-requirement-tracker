/** 계산 엔진 공개 API. */
export { evaluate } from './evaluate.js'
export * from './types.js'
export {
  buildCatalogIndex,
  normalizeText,
  normalizeCourse,
  resolveQuery,
} from './normalize.js'
export {
  analyzeEquivalents,
  computeEffectiveKeys,
  findFallbackBucketId,
  resolveBucketCandidates,
  pickBucket,
  getBucket,
} from './resolve.js'
export {
  supersededIds,
  stateFlags,
  buildContext,
  inProgressCredits,
} from './aggregate.js'
export {
  subsetSumMax,
  scaleIndex,
  evalCondition,
  DEFAULT_GRADE_POINTS,
  checkBucket,
  checkGPA,
  checkNonCurricular,
  checkAdditionalMajors,
  checkMajorPolicy,
} from './check.js'
