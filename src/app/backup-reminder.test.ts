import { describe, expect, it } from 'vitest'
import {
  REMINDER,
  backupStatus,
  evaluateBackupReminder,
  semesterEndPeriod,
  type ReminderInput,
} from './backup-reminder'
import { defaultSettings, type Settings } from '../storage/schema'

/** 기준 시각 — 학기말 창이 아닌 평범한 날(3월 15일). */
const PLAIN = new Date('2026-03-15T09:00:00.000Z')

function daysAgo(from: Date, n: number): string {
  return new Date(from.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
}

function settings(p: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...p }
}

function input(p: Partial<ReminderInput> & { courseCount: number }): ReminderInput {
  return { now: PLAIN, settings: settings(), ...p }
}

describe('semesterEndPeriod — 학기말 창(하순 20일~말일)', () => {
  it('6월 하순은 1학기말', () => {
    expect(semesterEndPeriod(new Date('2026-06-20T00:00:00'))).toBe('2026-1')
    expect(semesterEndPeriod(new Date('2026-06-30T23:59:00'))).toBe('2026-1')
  })
  it('12월 하순은 2학기말', () => {
    expect(semesterEndPeriod(new Date('2026-12-20T00:00:00'))).toBe('2026-2')
    expect(semesterEndPeriod(new Date('2026-12-31T23:59:00'))).toBe('2026-2')
  })
  it('하순 이전이거나 다른 달이면 null', () => {
    expect(semesterEndPeriod(new Date('2026-06-19T23:59:00'))).toBeNull()
    expect(semesterEndPeriod(new Date('2026-12-01T00:00:00'))).toBeNull()
    expect(semesterEndPeriod(new Date('2026-03-25T00:00:00'))).toBeNull()
    expect(semesterEndPeriod(new Date('2026-07-25T00:00:00'))).toBeNull()
  })
})

describe('evaluateBackupReminder — 기본 조건', () => {
  it('과목이 0이면 조르지 않는다', () => {
    expect(evaluateBackupReminder(input({ courseCount: 0 }))).toBeNull()
    // 학기말이어도 과목 0이면 없음
    expect(
      evaluateBackupReminder({ now: new Date('2026-06-25T00:00:00'), courseCount: 0, settings: settings() }),
    ).toBeNull()
  })

  it('백업 이력 없음 + 과목 5건 미만 → 없음', () => {
    expect(evaluateBackupReminder(input({ courseCount: REMINDER.minCoursesForFirstBackup - 1 }))).toBeNull()
  })

  it('백업 이력 없음 + 과목 5건 이상 → no_backup', () => {
    const r = evaluateBackupReminder(input({ courseCount: 6 }))
    expect(r?.reason).toBe('no_backup')
    expect(r?.emphasized).toBe(false)
    expect(r?.message).toContain('6개')
  })

  it('마지막 백업 후 30일 경과 → stale (경과일 표기)', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 3, settings: settings({ lastBackupAt: daysAgo(PLAIN, 31), courseCountAtLastBackup: 3 }) }),
    )
    expect(r?.reason).toBe('stale')
    expect(r?.message).toContain('31일')
  })

  it('마지막 백업 후 29일이면 stale 아님', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 3, settings: settings({ lastBackupAt: daysAgo(PLAIN, 29), courseCountAtLastBackup: 3 }) }),
    )
    expect(r).toBeNull()
  })

  it('백업 이후 과목 10건 이상 추가 → many_new', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 12, settings: settings({ lastBackupAt: daysAgo(PLAIN, 3), courseCountAtLastBackup: 2 }) }),
    )
    expect(r?.reason).toBe('many_new')
    expect(r?.message).toContain('10개')
  })

  it('백업 이후 과목 9건 추가면 아님', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 11, settings: settings({ lastBackupAt: daysAgo(PLAIN, 3), courseCountAtLastBackup: 2 }) }),
    )
    expect(r).toBeNull()
  })

  it('백업 시점 과목 수를 모르면 many_new를 판정하지 않는다(구버전 백업)', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 40, settings: settings({ lastBackupAt: daysAgo(PLAIN, 3), courseCountAtLastBackup: null }) }),
    )
    expect(r).toBeNull()
  })
})

describe('evaluateBackupReminder — 7일 닫기', () => {
  it('최근 7일 안에 닫았으면 일반 배너 숨김', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 8, settings: settings({ bannerDismissedAt: daysAgo(PLAIN, 3) }) }),
    )
    expect(r).toBeNull()
  })

  it('7일이 지나면 다시 뜬다', () => {
    const r = evaluateBackupReminder(
      input({ courseCount: 8, settings: settings({ bannerDismissedAt: daysAgo(PLAIN, 8) }) }),
    )
    expect(r?.reason).toBe('no_backup')
  })

  it('미래로 찍힌 닫기 시각(시계 오차)은 억제하지 않는다', () => {
    // 다른 기기(시계 앞섬)에서 만든 백업을 복원하면 미래 timestamp가 들어올 수 있다.
    const future = new Date(PLAIN.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString()
    const r = evaluateBackupReminder(input({ courseCount: 8, settings: settings({ bannerDismissedAt: future }) }))
    expect(r?.reason).toBe('no_backup')
  })
})

describe('evaluateBackupReminder — 학기말 강조', () => {
  const JUNE = new Date('2026-06-25T09:00:00')

  it('학기말이면 최근에 닫았어도 강조 배너(학기당 1회)', () => {
    const r = evaluateBackupReminder({
      now: JUNE,
      courseCount: 3,
      settings: settings({ bannerDismissedAt: daysAgo(JUNE, 1) }),
    })
    expect(r?.reason).toBe('semester')
    expect(r?.emphasized).toBe(true)
    expect(r?.period).toBe('2026-1')
  })

  it('이미 이 학기 강조를 처리했으면 일반 조건으로 내려간다', () => {
    // semesterNudgeShownFor가 현재 학기면 강조를 건너뛰고, 최근 닫기(7일)에 걸려 숨김.
    const r = evaluateBackupReminder({
      now: JUNE,
      courseCount: 8,
      settings: settings({ semesterNudgeShownFor: '2026-1', bannerDismissedAt: daysAgo(JUNE, 1) }),
    })
    expect(r).toBeNull()
  })

  it('강조 처리한 학기에도 다른 조건이 살아 있으면 일반 배너로 뜬다', () => {
    const r = evaluateBackupReminder({
      now: JUNE,
      courseCount: 8,
      settings: settings({ semesterNudgeShownFor: '2026-1' }),
    })
    expect(r?.reason).toBe('no_backup')
    expect(r?.emphasized).toBe(false)
  })
})

describe('backupStatus — 설정 표시용', () => {
  it('백업 이력 없으면 neverBackedUp', () => {
    const s = backupStatus(PLAIN, 5, settings())
    expect(s).toEqual({ neverBackedUp: true, daysSinceBackup: null, addedSinceBackup: null })
  })

  it('경과일과 추가 과목 수를 계산한다', () => {
    const s = backupStatus(PLAIN, 9, settings({ lastBackupAt: daysAgo(PLAIN, 12), courseCountAtLastBackup: 4 }))
    expect(s.neverBackedUp).toBe(false)
    expect(s.daysSinceBackup).toBe(12)
    expect(s.addedSinceBackup).toBe(5)
  })

  it('과목이 줄었으면 추가분은 0으로 바닥', () => {
    const s = backupStatus(PLAIN, 2, settings({ lastBackupAt: daysAgo(PLAIN, 1), courseCountAtLastBackup: 5 }))
    expect(s.addedSinceBackup).toBe(0)
  })
})
