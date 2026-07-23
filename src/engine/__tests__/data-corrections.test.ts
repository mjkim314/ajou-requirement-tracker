/**
 * 데이터 정정 반영 검증 — 데이터_정정_백로그.md.
 *
 * #1 어학인증 대안 11종(NEW TEPS 329·IELTS 5.5 추가 — 어학졸업인증제 3-3-7 [별표1])
 * #3 recognitionCaps 탑재(학칙 제45조2항 — 인정학점 졸업학점의 1/2 상한)
 *
 * 2021·2022 SW 4개 세트 전부에 동일하게 적용됐는지 고정한다.
 */

import { describe, it, expect } from 'vitest'
import type { RequirementSet } from '../types.js'
import {
  reqSet2021SwAdvanced,
  reqSet2021SwGeneral,
  reqSet2022SwAdvanced,
  reqSet2022SwGeneral,
} from '../../data/index.js'

const SETS: [string, RequirementSet][] = [
  ['2021 advanced', reqSet2021SwAdvanced],
  ['2021 general', reqSet2021SwGeneral],
  ['2022 advanced', reqSet2022SwAdvanced],
  ['2022 general', reqSet2022SwGeneral],
]

describe.each(SETS)('데이터 정정 — %s', (_name, set) => {
  it('english_cert 대안 11종, NEW TEPS 329·IELTS 5.5 포함', () => {
    const english = set.nonCurricular.find((n) => n.id === 'english_cert')
    expect(english).toBeDefined()
    expect(english!.alternatives).toHaveLength(11)

    const byId = new Map(english!.alternatives!.map((a) => [a.id, a]))
    expect(byId.get('new_teps')?.min).toBe(329)
    expect(byId.get('new_teps')?.type).toBe('score')
    expect(byId.get('ielts')?.min).toBe(5.5)
    expect(byId.get('ielts')?.type).toBe('score')
    expect(english!.sourceNote).toContain('별표1')
  })

  it('recognitionCaps: transferred·credited 합산 1/2 상한', () => {
    expect(set.recognitionCaps).toHaveLength(1)
    const cap = set.recognitionCaps![0]!
    expect(cap.maxRatioOfTotal).toBe(0.5)
    expect([...cap.states].sort()).toEqual(['credited', 'transferred'])
    expect(cap.sourceNote).toContain('제45조')
  })
})
