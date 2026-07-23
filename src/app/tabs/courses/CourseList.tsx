import type { Course, RequirementSet } from '../../../engine/index'
import { bucketLabel, type SemesterGroup } from '../../courses'
import { Icon } from '../../ui'
import { AreaExcludedBadge } from './AreaExcludedBadge'
import { StatusBadge } from './StatusBadge'

/** 엔진이 확정한 과목별 부가정보(귀속 영역·미확인·중복·이수인정). result.resolved에서 뽑는다. */
export interface CourseMeta {
  bucketId: string
  unmatched: boolean
  ambiguous: boolean
  /** 엔진이 이수학점으로 인정하는지(학기 합·표시에 사용). */
  countsForCredit: boolean
  /** 소속 계열이라 영역별교양으로 인정되지 않는 영역 id(아니면 null). */
  excludedArea?: string | null
}

interface Props {
  groups: SemesterGroup[]
  metaById: Map<string, CourseMeta>
  reqSet: RequirementSet
  /** 재수강으로 대체된(계산 제외) 이전 기록 id. */
  superseded: Set<string>
  onEdit: (course: Course) => void
  onDelete: (course: Course) => void
}

export function CourseList({ groups, metaById, reqSet, superseded, onEdit, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.semester || 'none'}>
          <header className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[13.5px] font-bold text-ink">{g.label}</h3>
            <span className="text-[12px] text-muted">
              {g.courses.length}과목 · {g.credits}학점
            </span>
          </header>

          {/* PC 테이블 */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface shadow-card lg:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line-2 text-[11.5px] text-muted">
                  <th className="px-4 py-2.5 font-semibold">과목명</th>
                  <th className="px-3 py-2.5 font-semibold">구분</th>
                  <th className="px-3 py-2.5 text-right font-semibold">학점</th>
                  <th className="px-3 py-2.5 font-semibold">상태·성적</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    <span className="sr-only">동작</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.courses.map((c) => {
                  const meta = metaById.get(c.id)
                  const dead = superseded.has(c.id)
                  return (
                    <tr key={c.id} className="border-b border-line-2 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[13px] font-semibold ${
                              dead ? 'text-muted-2 line-through' : 'text-ink'
                            }`}
                          >
                            {c.nameSnapshot}
                          </span>
                          <Flags meta={meta} dead={dead} />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-ink-3">
                        {bucketLabel(reqSet, meta?.bucketId)}
                      </td>
                      <td className="px-3 py-3 text-right text-[13px] tabular-nums text-ink-2">
                        {c.credits}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge course={c} dead={dead} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <IconButton icon="edit" label="수정" onClick={() => onEdit(c)} />
                          <IconButton icon="delete" label="삭제" danger onClick={() => onDelete(c)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {g.courses.map((c) => {
              const meta = metaById.get(c.id)
              const dead = superseded.has(c.id)
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-block border border-line bg-surface px-3.5 py-3 shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-[13.5px] font-semibold ${
                          dead ? 'text-muted-2 line-through' : 'text-ink'
                        }`}
                      >
                        {c.nameSnapshot}
                      </span>
                      <Flags meta={meta} dead={dead} />
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {bucketLabel(reqSet, meta?.bucketId)} · {c.credits}학점
                    </div>
                  </div>
                  <StatusBadge course={c} dead={dead} />
                  <div className="flex shrink-0 gap-0.5">
                    <IconButton icon="edit" label="수정" onClick={() => onEdit(c)} />
                    <IconButton icon="delete" label="삭제" danger onClick={() => onDelete(c)} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────

/** 카탈로그 미확인·중복 후보·영역별교양 미인정 표시. */
function Flags({ meta, dead }: { meta: CourseMeta | undefined; dead: boolean }) {
  if (dead || !meta) return null
  if (meta.excludedArea) {
    return <AreaExcludedBadge areaId={meta.excludedArea} />
  }
  if (meta.ambiguous) {
    return (
      <span
        title="학수번호가 여러 과목에 걸쳐 있어요. 수정에서 확인해 주세요."
        className="inline-flex shrink-0 items-center gap-0.5 rounded-chip bg-orange/10 px-1.5 py-0.5 text-[10px] font-bold text-orange"
      >
        <Icon name="help" className="text-[12px]" />
        중복 후보
      </span>
    )
  }
  if (meta.unmatched) {
    return (
      <span
        title="카탈로그에서 찾지 못한 과목이에요. 영역은 직접 지정한 값으로 계산돼요."
        className="inline-flex shrink-0 items-center gap-0.5 rounded-chip bg-bg-soft px-1.5 py-0.5 text-[10px] font-bold text-muted"
      >
        <Icon name="edit_note" className="text-[12px]" />
        직접입력
      </span>
    )
  }
  return null
}

function IconButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded-chip p-1.5 text-muted-2 transition-colors hover:bg-bg-soft ${
        danger ? 'hover:text-orange' : 'hover:text-ink-2'
      }`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  )
}
