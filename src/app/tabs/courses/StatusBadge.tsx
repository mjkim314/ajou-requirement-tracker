import type { Course, CourseState } from '../../../engine/index'
import { STATE_LABEL } from '../../courses'
import { Icon } from '../../ui'

// 과목 상태·성적 배지. 과목 탭(테이블·카드)과 요건 탭(영역 펼침 목록)에서 공유한다.
// 색 단독 금지 — 아이콘·텍스트를 항상 병기(색맹 대응).

export const STATE_STYLE: Record<CourseState, { cls: string; icon: string }> = {
  completed: { cls: 'bg-green/10 text-green', icon: 'check_circle' },
  enrolled: { cls: 'bg-blue/10 text-blue', icon: 'schedule' },
  planned: { cls: 'bg-bg-soft text-muted', icon: 'radio_button_unchecked' },
  retake_planned: { cls: 'bg-orange/10 text-orange', icon: 'restart_alt' },
  credited: { cls: 'bg-navy/10 text-navy', icon: 'swap_horiz' },
  transferred: { cls: 'bg-navy/10 text-navy', icon: 'swap_horiz' },
  dropped: { cls: 'bg-bg-soft text-muted-2', icon: 'block' },
}

/** 상태·성적 배지 — 색 단독 금지, 아이콘·텍스트 병기. */
export function StatusBadge({ course, dead }: { course: Course; dead: boolean }) {
  if (dead) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-bg-soft px-2 py-1 text-[11px] font-semibold text-muted-2">
        <Icon name="history" className="text-[13px]" />
        대체됨
      </span>
    )
  }
  const s = STATE_STYLE[course.state]
  // 완료·재수강이면 성적을, 그 외에는 상태명을 라벨로.
  const graded = course.state === 'completed' || course.state === 'retake_planned'
  const label = graded && course.grade ? course.grade : STATE_LABEL[course.state]
  const fail = course.grade === 'F' || course.grade === 'NP'
  const cls = fail ? 'bg-orange/10 text-orange' : s.cls
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-chip px-2 py-1 text-[11px] font-bold ${cls}`}
    >
      <Icon name={fail ? 'error' : s.icon} className="text-[13px]" />
      {course.state === 'retake_planned' && course.grade ? `재수강 ${label}` : label}
    </span>
  )
}
