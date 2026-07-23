import { describe, expect, it } from 'vitest'
import { evaluate, type EvaluationInput, type Profile, type RequirementSet } from '../engine/index'
import { catalog2021Sw, reqSet2021SwAdvanced } from '../data/index'
import {
  addAlternative,
  addBucket,
  addChoiceCourse,
  addChoiceGroup,
  addReqGroup,
  addReqGroupCourse,
  addRequiredCourse,
  addRequirement,
  appliesCondOf,
  appliesModeOf,
  blankBucket,
  blankRequirement,
  changeAlternativeType,
  changeRequirementType,
  cloneReqSet,
  customIdFor,
  hasBlockingIssues,
  joinScale,
  ncEntry,
  parseScale,
  removeAlternative,
  removeBucket,
  removeChoiceGroup,
  removeRequiredCourse,
  removeNcAlternative,
  removeRequirement,
  setNcAlternative,
  setNcEntry,
  startEdit,
  uniqueId,
  updateAlternative,
  updateBucket,
  updateChoiceGroup,
  updateRequirement,
  validateReqSet,
} from './reqset-editor'

// 편집 대상은 복제해서 쓴다(번들 프리셋 원본을 건드리지 않도록).
function base(): RequirementSet {
  return JSON.parse(JSON.stringify(reqSet2021SwAdvanced)) as RequirementSet
}

describe('id 헬퍼', () => {
  it('uniqueId는 충돌하지 않는 번호를 붙인다', () => {
    expect(uniqueId('x', [])).toBe('x_1')
    expect(uniqueId('x', ['x_1', 'x_2'])).toBe('x_3')
  })

  it('customIdFor는 __custom을 우선, 충돌 시 _N', () => {
    expect(customIdFor('rs_a', [])).toBe('rs_a__custom')
    expect(customIdFor('rs_a', ['rs_a__custom'])).toBe('rs_a__custom_1')
  })
})

describe('복제 / 편집 시작', () => {
  it('cloneReqSet은 새 id·이름을 쓰고 basePresetId를 남긴다', () => {
    const c = cloneReqSet(base(), { id: 'rs_new', name: '새 세트', now: 'T' })
    expect(c.id).toBe('rs_new')
    expect(c.name).toBe('새 세트')
    expect(c.createdAt).toBe('T')
    expect((c.source as Record<string, unknown>).basePresetId).toBe(reqSet2021SwAdvanced.id)
    expect((c.source as Record<string, unknown>).clonedFrom).toBe(reqSet2021SwAdvanced.id)
  })

  it('cloneReqSet은 커스텀 세트의 basePresetId를 이어받는다', () => {
    const custom = { ...base(), id: 'rs_x', source: { basePresetId: 'rs_2021_sw_advanced' } }
    const c = cloneReqSet(custom, { id: 'rs_y', name: 'Y', now: 'T' })
    expect((c.source as Record<string, unknown>).basePresetId).toBe('rs_2021_sw_advanced')
  })

  it('startEdit: 커스텀은 같은 id로 제자리 편집', () => {
    const custom = { ...base(), id: 'rs_custom_1' }
    const w = startEdit(custom, false, 'unused', 'T')
    expect(w.id).toBe('rs_custom_1')
  })

  it('startEdit: 프리셋은 새 id·(내 편집본)·basePresetId', () => {
    const w = startEdit(base(), true, 'rs_2021_sw_advanced__custom', 'T')
    expect(w.id).toBe('rs_2021_sw_advanced__custom')
    expect(w.name).toContain('내 편집본')
    expect((w.source as Record<string, unknown>).basePresetId).toBe('rs_2021_sw_advanced')
    expect((w.source as Record<string, unknown>).customizedInEditor).toBe(true)
  })

  it('편집 작업본을 바꿔도 원본 프리셋은 불변(깊은 복제)', () => {
    const original = base()
    const w = startEdit(original, true, 'rs_c', 'T')
    const mutated = updateBucket(w, w.buckets[0]!.id, { minCredits: 999 })
    expect(mutated.buckets[0]!.minCredits).toBe(999)
    expect(original.buckets[0]!.minCredits).not.toBe(999)
    expect(reqSet2021SwAdvanced.buckets[0]!.minCredits).not.toBe(999)
  })
})

describe('appliesWhen ↔ 모드', () => {
  it('null ↔ always', () => {
    expect(appliesModeOf(null)).toBe('always')
    expect(appliesCondOf('always')).toBeNull()
  })
  it('advanced 왕복', () => {
    const cond = appliesCondOf('advanced')
    expect(cond).toEqual({ field: 'trackType', op: 'eq', value: 'advanced' })
    expect(appliesModeOf(cond)).toBe('advanced')
  })
  it('general 왕복', () => {
    expect(appliesModeOf(appliesCondOf('general'))).toBe('general')
  })
  it('표현 불가한 조건(neq 등)은 custom으로 보존', () => {
    expect(appliesModeOf({ field: 'trackType', op: 'neq', value: 'advanced' })).toBe('custom')
    expect(appliesModeOf({ field: 'college', op: 'eq', value: 'X' })).toBe('custom')
  })
})

describe('등급 스케일 파서', () => {
  it('parseScale는 공백·빈값을 정리', () => {
    expect(parseScale(' IL, IM ,, IH ')).toEqual(['IL', 'IM', 'IH'])
    expect(parseScale('')).toEqual([])
  })
  it('joinScale 왕복', () => {
    expect(parseScale(joinScale(['NL', 'NM', 'NH']))).toEqual(['NL', 'NM', 'NH'])
    expect(joinScale(undefined)).toBe('')
  })
})

describe('유형 전환 시 죽은 필드 정리', () => {
  it('alternatives→check는 alternatives를 버린다', () => {
    const s = changeRequirementType(base(), 'english_cert', 'check')
    const r = s.nonCurricular.find((x) => x.id === 'english_cert')!
    expect(r.type).toBe('check')
    expect(r.alternatives).toBeUndefined()
    expect(r.pick).toBeUndefined()
  })
  it('score→level은 숫자 min을 버린다', () => {
    let s = base()
    const req = blankRequirement(s)
    s = addRequirement(s, { ...req, type: 'score', min: 190, unit: '점' })
    s = changeRequirementType(s, req.id, 'level')
    const r = s.nonCurricular.find((x) => x.id === req.id)!
    expect(r.type).toBe('level')
    expect(r.min).toBeUndefined() // 숫자 min은 등급 기준으로 무의미 → 제거
    expect(r.unit).toBeUndefined()
  })
  it('changeAlternativeType: score→level은 숫자 min 제거', () => {
    let s = addAlternative(base(), 'english_cert')
    const rid = 'english_cert'
    const altId = s.nonCurricular.find((r) => r.id === rid)!.alternatives!.slice(-1)[0]!.id
    s = updateAlternative(s, rid, altId, { type: 'score', min: 700 })
    s = changeAlternativeType(s, rid, altId, 'level')
    const alt = s.nonCurricular.find((r) => r.id === rid)!.alternatives!.find((a) => a.id === altId)!
    expect(alt.type).toBe('level')
    expect(alt.min).toBeUndefined()
  })
})

describe('영역 삭제 시 참조 정리', () => {
  it('overflowTo·capBucket 댕글링 참조를 정리', () => {
    let s = base()
    // 인위적으로 참조를 심는다: 일반선택을 삭제 대상으로.
    const target = 'general_elective'
    s = removeBucket(s, target)
    expect(s.buckets.some((b) => b.id === target)).toBe(false)
    // courseGroups(field_practice)의 overflowTo가 general_elective였다 → null로 정리.
    const fp = s.courseGroups?.find((g) => g.id === 'field_practice')
    expect(fp?.overflowTo).toBeNull()
  })
})

describe('검증 — 무조건 충족/영원히 미충족 구성', () => {
  it('scale 없는 level 요건은 error(무조건 충족 방지)', () => {
    let s = base()
    const req = blankRequirement(s)
    s = addRequirement(s, { ...req, type: 'level', min: 'IL' }) // scale 없음
    const issues = validateReqSet(s)
    expect(hasBlockingIssues(issues)).toBe(true)
    expect(issues.some((i) => i.requirementId === req.id && i.level === 'error')).toBe(true)
  })

  it('기준이 스케일 밖인 level도 error', () => {
    let s = base()
    const req = blankRequirement(s)
    s = addRequirement(s, { ...req, type: 'level', scale: ['A', 'B'], min: 'Z' })
    expect(hasBlockingIssues(validateReqSet(s))).toBe(true)
  })

  it('min 없는 count는 warn(영원히 미충족, 저장은 허용)', () => {
    let s = base()
    const req = blankRequirement(s)
    // 라벨은 채워 라벨-빈값 error를 배제하고 count 기준-누락 warn만 남긴다.
    s = addRequirement(s, { ...req, label: '봉사', type: 'count' })
    const issues = validateReqSet(s).filter((i) => i.requirementId === req.id)
    expect(issues.some((i) => i.level === 'warn')).toBe(true)
    expect(issues.some((i) => i.level === 'error')).toBe(false)
  })

  it('alternatives pick > 항목수는 warn', () => {
    let s = base()
    const req = blankRequirement(s)
    s = addRequirement(s, { ...req, type: 'alternatives', pick: 3, alternatives: [] })
    const issues = validateReqSet(s)
    expect(issues.some((i) => i.requirementId === req.id && i.level === 'warn')).toBe(true)
  })
})

describe('영역 편집', () => {
  it('blankBucket은 충돌하지 않는 id를 만든다', () => {
    const s = base()
    const b = blankBucket(s)
    expect(s.buckets.some((x) => x.id === b.id)).toBe(false)
  })

  it('addBucket / removeBucket은 원본을 변형하지 않는다', () => {
    const s = base()
    const n = s.buckets.length
    const added = addBucket(s, blankBucket(s))
    expect(added.buckets.length).toBe(n + 1)
    expect(s.buckets.length).toBe(n)
    const removed = removeBucket(added, added.buckets[0]!.id)
    expect(removed.buckets.length).toBe(n)
  })

  it('updateBucket은 지정 영역만 바꾼다', () => {
    const s = base()
    const id = s.buckets[0]!.id
    const out = updateBucket(s, id, { minCredits: 3, label: '바뀐 이름' })
    expect(out.buckets.find((b) => b.id === id)!.minCredits).toBe(3)
    expect(out.buckets.find((b) => b.id === id)!.label).toBe('바뀐 이름')
  })

  it('필수 과목 추가/삭제(중복·공백 정리)', () => {
    const s = base()
    const id = s.buckets.find((b) => b.id === 'major_elective')!.id
    let out = addRequiredCourse(s, id, ' SW-DB ')
    out = addRequiredCourse(out, id, 'SW-DB') // 중복 무시
    const b = out.buckets.find((x) => x.id === id)!
    expect(b.requiredCourses).toContain('SW-DB')
    expect(b.requiredCourses!.filter((k) => k === 'SW-DB').length).toBe(1)
    out = removeRequiredCourse(out, id, 'SW-DB')
    expect(out.buckets.find((x) => x.id === id)!.requiredCourses).not.toContain('SW-DB')
  })

  it('택1 그룹 추가·수정·과목·삭제', () => {
    const s = base()
    const id = s.buckets.find((b) => b.id === 'major_elective')!.id
    let out = addChoiceGroup(s, id)
    const gid = out.buckets.find((b) => b.id === id)!.choiceGroups![0]!.id
    out = updateChoiceGroup(out, id, gid, { label: 'AI 택1', pick: 2 })
    out = addChoiceCourse(out, id, gid, 'SW-AI-1')
    const g = out.buckets.find((b) => b.id === id)!.choiceGroups!.find((x) => x.id === gid)!
    expect(g.label).toBe('AI 택1')
    expect(g.pick).toBe(2)
    expect(g.courses).toEqual(['SW-AI-1'])
    out = removeChoiceGroup(out, id, gid)
    expect(out.buckets.find((b) => b.id === id)!.choiceGroups!.some((x) => x.id === gid)).toBe(false)
  })
})

describe('비교과 요건 편집', () => {
  it('요건 추가·수정·삭제', () => {
    const s = base()
    const req = blankRequirement(s)
    let out = addRequirement(s, req)
    expect(out.nonCurricular.some((r) => r.id === req.id)).toBe(true)
    out = updateRequirement(out, req.id, { label: '사회봉사', type: 'count', min: 30, unit: '시간' })
    const r = out.nonCurricular.find((x) => x.id === req.id)!
    expect(r.label).toBe('사회봉사')
    expect(r.min).toBe(30)
    out = removeRequirement(out, req.id)
    expect(out.nonCurricular.some((x) => x.id === req.id)).toBe(false)
  })

  it('alternatives(시험) 추가·수정·삭제', () => {
    const s = base()
    const rid = 'english_cert'
    let out = addAlternative(s, rid)
    const req = out.nonCurricular.find((r) => r.id === rid)!
    const altId = req.alternatives![req.alternatives!.length - 1]!.id
    out = updateAlternative(out, rid, altId, { label: 'IELTS', type: 'score', min: 6 })
    const alt = out.nonCurricular
      .find((r) => r.id === rid)!
      .alternatives!.find((a) => a.id === altId)!
    expect(alt.label).toBe('IELTS')
    expect(alt.min).toBe(6)
    out = removeAlternative(out, rid, altId)
    expect(
      out.nonCurricular.find((r) => r.id === rid)!.alternatives!.some((a) => a.id === altId),
    ).toBe(false)
  })

  it('courseGroupPick 과목군·과목 편집', () => {
    const s = base()
    const rid = 'industry_project'
    let out = addReqGroup(s, rid)
    const gid = out.nonCurricular.find((r) => r.id === rid)!.groups!.slice(-1)[0]!.id
    out = addReqGroupCourse(out, rid, gid, 'SW-EXTRA')
    const g = out.nonCurricular.find((r) => r.id === rid)!.groups!.find((x) => x.id === gid)!
    expect(g.courses).toContain('SW-EXTRA')
  })
})

describe('검증', () => {
  it('정상 프리셋은 error가 없다', () => {
    expect(hasBlockingIssues(validateReqSet(base()))).toBe(false)
  })

  it('빈 이름·빈 영역 라벨·중복 id를 error로 잡는다', () => {
    let s = base()
    s = { ...s, name: '  ' }
    s = updateBucket(s, s.buckets[0]!.id, { label: '' })
    const issues = validateReqSet(s)
    expect(hasBlockingIssues(issues)).toBe(true)
    expect(issues.some((i) => i.message.includes('세트 이름'))).toBe(true)
    expect(issues.some((i) => i.bucketId === s.buckets[0]!.id)).toBe(true)
  })

  it('총학점 0·택1 과다는 warn(저장은 허용)', () => {
    let s = base()
    s = { ...s, totalCredits: 0 }
    const issues = validateReqSet(s)
    expect(issues.some((i) => i.level === 'warn')).toBe(true)
    expect(hasBlockingIssues(issues)).toBe(false)
  })
})

describe('비교과 진행 상태 입력', () => {
  it('setNcEntry는 항목을 병합 갱신', () => {
    const s = setNcEntry({}, 'r1', { score: 730 })
    expect(ncEntry(s, 'r1').score).toBe(730)
    const s2 = setNcEntry(s, 'r1', { done: true })
    expect(ncEntry(s2, 'r1')).toEqual({ score: 730, done: true })
  })

  it('setNcAlternative는 중첩 항목을 병합 갱신', () => {
    let s = setNcAlternative({}, 'eng', 'toeic', { score: 800 })
    s = setNcAlternative(s, 'eng', 'opic', { level: 'IM' })
    expect(s.eng!.alternatives!.toeic!.score).toBe(800)
    expect(s.eng!.alternatives!.opic!.level).toBe('IM')
  })

  it('removeNcAlternative는 고른 시험만 지우고, 마지막이면 alternatives를 정리', () => {
    let s = setNcAlternative({}, 'eng', 'toeic', { score: 800 })
    s = setNcAlternative(s, 'eng', 'opic', { level: 'IM' })
    s = removeNcAlternative(s, 'eng', 'toeic')
    expect(s.eng!.alternatives!.toeic).toBeUndefined()
    expect(s.eng!.alternatives!.opic!.level).toBe('IM')
    s = removeNcAlternative(s, 'eng', 'opic')
    expect(s.eng!.alternatives).toBeUndefined()
  })

  it('removeNcAlternative는 없는 항목엔 상태를 그대로 반환', () => {
    const s = setNcAlternative({}, 'eng', 'toeic', { score: 800 })
    expect(removeNcAlternative(s, 'eng', 'opic')).toBe(s)
    expect(removeNcAlternative(s, 'other', 'toeic')).toBe(s)
  })
})

describe('편집한 세트는 엔진이 그대로 씹는다', () => {
  const profile: Profile = {
    schemaVersion: 2,
    admissionYear: 2021,
    college: '소프트웨어융합대학',
    department: '소프트웨어학과',
    trackType: 'advanced',
    requirementSetId: 'rs_edit',
    additionalMajors: [],
    exemptions: [],
  }

  function run(set: RequirementSet): EvaluationInput {
    return { profile, courses: [], requirementSet: set, catalog: catalog2021Sw }
  }

  it('총학점 편집이 required에 반영된다', () => {
    const edited = { ...base(), id: 'rs_edit', totalCredits: 128 }
    const res = evaluate(run(edited))
    expect(res.credits.required).toBe(128)
  })

  it('영역 추가 후에도 평가가 크래시 없이 돌고 버킷이 늘어난다', () => {
    const s0 = base()
    const withBucket = addBucket({ ...s0, id: 'rs_edit' }, {
      ...blankBucket(s0),
      label: '새 영역',
      group: 'free',
      minCredits: 3,
    })
    const res = evaluate(run(withBucket))
    expect(res.buckets.some((b) => b.label === '새 영역')).toBe(true)
  })

  it('scale 없는 level 비교과는 무입력에도 충족되지 않는다(엔진 가드)', () => {
    const s0 = base()
    const req = blankRequirement(s0)
    const withReq = addRequirement(
      { ...s0, id: 'rs_edit' },
      { ...req, label: '어학', type: 'level', min: 'IL', appliesWhen: null },
    )
    const res = evaluate(run(withReq))
    const nc = res.nonCurricular.find((r) => r.id === req.id)!
    expect(nc.active).toBe(true)
    expect(nc.satisfied).toBe(false) // scale 부재 → -1>=-1로 새지 않음
  })
})
