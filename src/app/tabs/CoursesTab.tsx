import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../AppState'
import { Button, Card, Icon, Modal } from '../ui'
import { supersededIds, type Course } from '../../engine/index'
import { groupBySemester, type CourseDraft } from '../courses'
import { CourseList, type CourseMeta } from './courses/CourseList'
import { CourseFormModal } from './courses/CourseFormModal'

export function CoursesTab() {
  const {
    state,
    input,
    result,
    reqSet,
    setActiveTab,
    pendingAddCourse,
    consumeAddCourse,
    addCourse,
    updateCourse,
    removeCourse,
  } = useAppState()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)

  // 다른 탭(요약 빈 상태)에서 "과목 추가"를 요청하면 폼을 열고 플래그를 소비한다
  // (탭을 다시 방문해도 폼이 재차 열리지 않도록 소비 후 리셋).
  useEffect(() => {
    if (pendingAddCourse) {
      setEditing(null)
      setFormOpen(true)
      consumeAddCourse()
    }
  }, [pendingAddCourse, consumeAddCourse])

  const courses = state.courses
  const superseded = useMemo(() => supersededIds(courses), [courses])
  const metaById = useMemo(() => {
    const m = new Map<string, CourseMeta>()
    for (const r of result?.resolved ?? []) {
      m.set(r.course.id, {
        bucketId: r.bucketId,
        unmatched: r.unmatched,
        ambiguous: !!r.ambiguousCandidates,
        countsForCredit: r.countsForCredit,
      })
    }
    return m
  }, [result])
  // 학기 학점 합은 엔진의 이수 인정(countsForCredit)만 더한다 — 앱에서 재판정하지 않는다(규칙 1).
  const groups = useMemo(
    () => groupBySemester(courses, (c) => metaById.get(c.id)?.countsForCredit ?? false),
    [courses, metaById],
  )

  if (!reqSet || !input) return null

  const defaultSemester = state.profile?.currentSemester || groups[0]?.semester || ''

  function openAdd() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(course: Course) {
    setEditing(course)
    setFormOpen(true)
  }
  function onSubmit(draft: CourseDraft) {
    if (editing) updateCourse(editing.id, draft)
    else addCourse(draft)
  }
  function confirmDelete() {
    if (deleteTarget) removeCourse(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {courses.length === 0 ? (
        <EmptyState onAdd={openAdd} onRestore={() => setActiveTab('settings')} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-ink-3">
              총 <b className="text-ink">{courses.length}</b>과목 · {groups.length}개 학기
            </div>
            <Button variant="primary" icon="add" onClick={openAdd}>
              과목 추가
            </Button>
          </div>
          <CourseList
            groups={groups}
            metaById={metaById}
            reqSet={reqSet}
            superseded={superseded}
            onEdit={openEdit}
            onDelete={(c) => setDeleteTarget(c)}
          />
        </>
      )}

      <CourseFormModal
        open={formOpen}
        initial={editing}
        reqSet={reqSet}
        catalog={input.catalog}
        allCourses={courses}
        defaultSemester={defaultSemester}
        admissionYear={state.profile?.admissionYear ?? 0}
        onClose={() => setFormOpen(false)}
        onSubmit={onSubmit}
      />

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="과목 삭제"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="danger" icon="delete" onClick={confirmDelete}>
              삭제
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p>
            <b className="text-ink">{deleteTarget.nameSnapshot}</b> 과목을 삭제할까요? 되돌릴 수 없어요.
          </p>
        )}
      </Modal>
    </div>
  )
}

function EmptyState({ onAdd, onRestore }: { onAdd: () => void; onRestore: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue/10">
          <Icon name="library_add" className="text-[34px] text-blue" />
        </span>
        <div className="text-[15px] font-bold text-ink">아직 과목이 없어요</div>
        <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
          수강한 과목을 추가하면 진행률과 평점이 자동으로 계산됩니다.
        </p>
        <div className="mt-5">
          <Button variant="primary" icon="add" onClick={onAdd}>
            첫 과목 추가하기
          </Button>
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-blue/20 bg-blue/[0.04] p-4">
        <Icon name="upload_file" className="mt-0.5 text-[20px] text-blue" />
        <div className="flex-1">
          <div className="text-[12.5px] font-bold text-navy">이전 데이터가 있나요?</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
            설정에서 백업 JSON 파일을 불러오면 그대로 복원됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 self-center rounded-chip px-2.5 py-1.5 text-[12px] font-bold text-blue hover:bg-blue/10"
        >
          설정으로
        </button>
      </Card>
    </div>
  )
}
