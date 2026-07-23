/**
 * 백업 리마인더 판정 (순수). 화면·localStorage·전역 시각을 참조하지 않고, 인자로 받은 것만 쓴다.
 *
 * TASKS.md 7단계 배너 조건:
 * - 백업 이력 없음 + 과목 5건 이상 → 배너
 * - 마지막 백업 후 30일 경과 → 배너
 * - 마지막 백업 이후 과목 10건 이상 추가 → 배너
 * - 배너 닫음 → 7일간 숨김
 * - 학기말(6월 말·12월 말) → 학기당 1회 강조(닫기와 무관)
 *
 * 여기 임계값(5·10·30·7·20)은 졸업요건 숫자가 아니라 UX 휴리스틱이라 이 모듈에 상수로 둔다.
 */

import type { Settings } from '../storage/schema'

export type BackupReminderReason = 'semester' | 'no_backup' | 'stale' | 'many_new'

export interface BackupReminder {
  reason: BackupReminderReason
  /** 학기말 강조 여부(네이비 강조 배너). 나머지는 일반(정보) 배너. */
  emphasized: boolean
  /** 배너 본문. 담백하게, 겁주지 않게. */
  message: string
  /** 학기말 강조일 때 해당 학기 식별자('2026-1'·'2026-2'). 닫을 때 semesterNudgeShownFor에 기록. */
  period: string | null
}

/** 백업 리마인더 UX 임계값(요건 숫자 아님). */
export const REMINDER = {
  /** 백업 이력이 없을 때 배너를 띄우는 최소 과목 수. */
  minCoursesForFirstBackup: 5,
  /** 마지막 백업 후 배너를 띄우는 경과 일수. */
  staleDays: 30,
  /** 마지막 백업 이후 배너를 띄우는 추가 과목 수. */
  newCoursesSinceBackup: 10,
  /** 배너를 닫은 뒤 숨기는 일수. */
  dismissHideDays: 7,
  /** 학기말 강조 창의 시작일(해당 월 하순: 이 날짜~말일). */
  semesterEndFromDay: 20,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** 두 시각의 경과 일수(내림). 미래(음수)면 음수. */
function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS)
}

/**
 * now가 학기말(6월 하순·12월 하순) 창이면 학기 식별자, 아니면 null.
 * 6월 → 'YYYY-1'(1학기말), 12월 → 'YYYY-2'(2학기말).
 */
export function semesterEndPeriod(now: Date): string | null {
  const month = now.getMonth() + 1 // 1..12
  const day = now.getDate()
  if (day < REMINDER.semesterEndFromDay) return null
  if (month === 6) return `${now.getFullYear()}-1`
  if (month === 12) return `${now.getFullYear()}-2`
  return null
}

/** 리마인더 판정에 필요한 설정 필드만. */
type ReminderSettings = Pick<
  Settings,
  'lastBackupAt' | 'bannerDismissedAt' | 'courseCountAtLastBackup' | 'semesterNudgeShownFor'
>

export interface ReminderInput {
  now: Date
  courseCount: number
  settings: ReminderSettings
}

/**
 * 지금 백업 리마인더 배너를 띄울지 판정한다. 띄우지 않으면 null.
 * 학기말 강조가 최우선(7일 닫기와 무관, 학기당 1회). 나머지는 최근 7일 닫기면 숨긴다.
 */
export function evaluateBackupReminder({ now, courseCount, settings }: ReminderInput): BackupReminder | null {
  // 백업할 게 없으면(과목 0) 조르지 않는다.
  if (courseCount < 1) return null

  const nowMs = now.getTime()

  // 1) 학기말 1회 강조 — 7일 닫기와 무관. 이 학기 아직 처리 안 했으면 강조.
  const period = semesterEndPeriod(now)
  if (period && settings.semesterNudgeShownFor !== period) {
    return {
      reason: 'semester',
      emphasized: true,
      period,
      message: '학기말이에요. 이번 학기 기록을 백업 파일로 받아두면 안심돼요.',
    }
  }

  // 2) 나머지 조건은 최근 7일 안에 배너를 닫았으면 숨긴다.
  //    미래로 찍힌 닫기 시각(시계 오차·다른 기기 백업 복원)은 음수가 되므로 억제하지 않는다
  //    — 그렇지 않으면 실제 시간이 그 시점을 지날 때까지 리마인더가 무한 억제된다.
  const dismissedAt = parseTime(settings.bannerDismissedAt)
  if (dismissedAt != null) {
    const since = daysBetween(dismissedAt, nowMs)
    if (since >= 0 && since < REMINDER.dismissHideDays) return null
  }

  const lastBackup = parseTime(settings.lastBackupAt)

  // 백업 이력 없음 + 과목 N건 이상
  if (lastBackup == null) {
    if (courseCount >= REMINDER.minCoursesForFirstBackup) {
      return {
        reason: 'no_backup',
        emphasized: false,
        period: null,
        message: `과목을 ${courseCount}개 넣었는데 아직 백업한 적이 없어요. 지금 파일로 받아두면 안전해요.`,
      }
    }
    return null
  }

  // 마지막 백업 후 30일 경과
  const daysSince = daysBetween(lastBackup, nowMs)
  if (daysSince >= REMINDER.staleDays) {
    return {
      reason: 'stale',
      emphasized: false,
      period: null,
      message: `백업한 지 ${daysSince}일 됐어요. 새로 받아두는 걸 권해요.`,
    }
  }

  // 마지막 백업 이후 과목 10건 이상 추가 (백업 시점 과목 수를 알 때만)
  const countAtBackup = settings.courseCountAtLastBackup
  if (countAtBackup != null) {
    const added = courseCount - countAtBackup
    if (added >= REMINDER.newCoursesSinceBackup) {
      return {
        reason: 'many_new',
        emphasized: false,
        period: null,
        message: `백업 후 과목을 ${added}개 추가했어요. 지금 백업해 두는 걸 권해요.`,
      }
    }
  }

  return null
}

// ────────────────────────────────────────────────────────────
// 설정 화면용 백업 상태 요약 (표시 전용)
// ────────────────────────────────────────────────────────────

export interface BackupStatus {
  /** 한 번도 백업하지 않았는지. */
  neverBackedUp: boolean
  /** 마지막 백업 경과 일수(내림). 백업 이력 없으면 null. */
  daysSinceBackup: number | null
  /** 마지막 백업 이후 추가한 과목 수. 계산 불가면 null. 음수는 0으로. */
  addedSinceBackup: number | null
}

/** 설정 탭의 백업 상태 요약을 계산한다(표시 전용). */
export function backupStatus(
  now: Date,
  courseCount: number,
  settings: ReminderSettings,
): BackupStatus {
  const lastBackup = parseTime(settings.lastBackupAt)
  if (lastBackup == null) {
    return { neverBackedUp: true, daysSinceBackup: null, addedSinceBackup: null }
  }
  const countAtBackup = settings.courseCountAtLastBackup
  return {
    neverBackedUp: false,
    daysSinceBackup: Math.max(0, daysBetween(lastBackup, now.getTime())),
    addedSinceBackup: countAtBackup == null ? null : Math.max(0, courseCount - countAtBackup),
  }
}
