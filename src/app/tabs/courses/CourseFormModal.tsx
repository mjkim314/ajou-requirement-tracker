import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CatalogEntry, Course, CourseState, Grade, RequirementSet } from '../../../engine/index'
import {
  GRADE_OPTIONS,
  GRADED_STATES,
  STATE_OPTIONS,
  blankDraft,
  bucketLabel,
  catalogByKey,
  courseToDraft,
  hasErrors,
  previewBucketId,
  semesterLabel,
  semesterSortKey,
  validateDraft,
  type CourseDraft,
} from '../../courses'
import { areaPolicyOf, excludedAreaOf } from '../../../data/merge'
import { buildSearchDocs } from '../../search'
import { Button, Icon, Modal } from '../../ui'
import { Field, NumberField, SelectField, TextField } from '../../onboarding/fields'
import { areaExcludedHint } from './AreaExcludedBadge'
import { CourseAutocomplete } from './CourseAutocomplete'

interface Props {
  open: boolean
  /** 편집 대상. null이면 추가 모드. */
  initial: Course | null
  reqSet: RequirementSet
  catalog: CatalogEntry[]
  allCourses: Course[]
  /** 추가 시 기본 학기(현재 학기 등). */
  defaultSemester: string
  /** 대체 규칙(equivalents) 프리뷰 귀속을 학번에 맞게 적용하기 위한 입학연도. */
  admissionYear: number
  onClose: () => void
  onSubmit: (draft: CourseDraft) => void
}

export function CourseFormModal({
  open,
  initial,
  reqSet,
  catalog,
  allCourses,
  defaultSemester,
  admissionYear,
  onClose,
  onSubmit,
}: Props) {
  const nameFieldId = useId()
  const nameHintId = useId()
  const [draft, setDraft] = useState<CourseDraft>(() =>
    initial ? courseToDraft(initial) : blankDraft(defaultSemester),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [retakeLinkOpen, setRetakeLinkOpen] = useState(false)
  const wasOpen = useRef(false)

  // 열릴 때마다 초안을 초기화(모달은 계속 마운트된 채 open만 토글되므로).
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(initial ? courseToDraft(initial) : blankDraft(defaultSemester))
      setRetakeLinkOpen(!!initial?.retakeOf && initial.state === 'completed')
      setShowErrors(false)
    }
    wasOpen.current = open
  }, [open, initial, defaultSemester])

  const docs = useMemo(() => buildSearchDocs(catalog), [catalog])
  const catMap = useMemo(() => catalogByKey(catalog), [catalog])

  // 소속 계열이라 영역별교양으로 인정되지 않는 영역 — 후보 목록과 선택 결과에 함께 알린다.
  const areaPolicy = useMemo(() => areaPolicyOf(reqSet), [reqSet])
  const pickedExcludedArea = excludedAreaOf(
    draft.courseKey ? catMap.get(draft.courseKey) : null,
    areaPolicy,
  )

  const autoBucketId = previewBucketId(
    { courseKey: draft.courseKey, bucketOverride: null },
    catMap,
    reqSet,
    admissionYear,
  )
  const unmatched = draft.courseKey == null
  const selectedBucketId = unmatched
    ? draft.bucketOverride ?? ''
    : draft.bucketOverride ?? autoBucketId ?? ''

  const showNameHint = unmatched && draft.nameSnapshot.trim().length > 0
  const graded = GRADED_STATES.includes(draft.state)
  const isRetake = draft.state === 'retake_planned'
  const showRetakeSelect = isRetake || (draft.state === 'completed' && retakeLinkOpen)

  const priorOptions = useMemo(() => {
    const selfId = initial?.id
    return allCourses
      .filter((c) => c.id !== selfId && c.state !== 'planned' && c.state !== 'dropped')
      .sort((a, b) => {
        const ak = a.courseKey && a.courseKey === draft.courseKey ? 0 : 1
        const bk = b.courseKey && b.courseKey === draft.courseKey ? 0 : 1
        if (ak !== bk) return ak - bk
        return semesterSortKey(b.semester) - semesterSortKey(a.semester)
      })
  }, [allCourses, initial, draft.courseKey])

  const errors = validateDraft(draft)
  const stateDesc = STATE_OPTIONS.find((o) => o.value === draft.state)?.desc

  function patch(p: Partial<CourseDraft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function onPickCatalog(entry: CatalogEntry) {
    patch({
      courseKey: entry.courseKey,
      nameSnapshot: entry.name,
      credits: entry.credits,
      bucketOverride: null,
    })
  }

  function onStateChange(s: CourseState) {
    setDraft((d) => ({
      ...d,
      state: s,
      // 재수강/완료가 아닌 상태로 바꾸면 재수강 연결을 해제.
      retakeOf: s === 'retake_planned' || s === 'completed' ? d.retakeOf : null,
    }))
    // 완료로 전환 시 '재수강 결과' 체크박스를 실제 링크 유무에 맞춰 동기화한다
    // (재수강예정→완료로 바꿔도 링크가 남아 조용히 계산에서 빠지는 UI-데이터 불일치 방지).
    setRetakeLinkOpen(s === 'completed' ? !!draft.retakeOf : false)
  }

  function onBucketChange(v: string) {
    setDraft((d) => ({
      ...d,
      // 미확인 과목은 선택을 늘 override로 보존. 확인된 과목은 자동값과 같으면 '자동'(null).
      bucketOverride: d.courseKey == null ? v || null : v === autoBucketId ? null : v,
    }))
  }

  function onPickPrior(id: string) {
    const prior = allCourses.find((c) => c.id === id) ?? null
    setDraft((d) => ({
      ...d,
      retakeOf: id || null,
      // 재수강 예정이면 이전 성적을 그대로 유지(비어 있을 때만 채움).
      grade: d.state === 'retake_planned' && d.grade == null && prior?.grade ? prior.grade : d.grade,
    }))
  }

  function submit() {
    setShowErrors(true)
    if (hasErrors(errors)) return
    onSubmit(draft)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '과목 수정' : '과목 추가'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" icon="check" onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 과목명 (자동완성) */}
        <Field label="과목명" htmlFor={nameFieldId}>
          <CourseAutocomplete
            id={nameFieldId}
            describedBy={showNameHint ? nameHintId : undefined}
            value={draft.nameSnapshot}
            resolved={!unmatched}
            docs={docs}
            onPick={onPickCatalog}
            onType={(text) => patch({ nameSnapshot: text, courseKey: null })}
            excludedAreaOf={(entry) => excludedAreaOf(entry, areaPolicy)}
          />
        </Field>
        {pickedExcludedArea && (
          <p className="-mt-1 flex items-start gap-1.5 rounded-block bg-orange/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            <Icon name="do_not_disturb_on" className="mt-px shrink-0 text-[14px] text-orange" />
            {areaExcludedHint(pickedExcludedArea)}
          </p>
        )}
        {showNameHint && (
          <p id={nameHintId} className="-mt-1 text-[11.5px] leading-relaxed text-ink-3">
            카탈로그에 없는 과목이에요. 학점과 영역을 직접 정해주세요.
          </p>
        )}
        {showErrors && errors.nameSnapshot && <FieldError>{errors.nameSnapshot}</FieldError>}

        {/* 학점 · 구분 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label="학점">
              <NumberField
                value={draft.credits}
                onChange={(v) => patch({ credits: v })}
                min={0}
                step={1}
                suffix="학점"
                placeholder="3"
              />
            </Field>
            {showErrors && errors.credits && <FieldError>{errors.credits}</FieldError>}
          </div>
          <div>
            <Field label="구분(영역)">
              <SelectField value={selectedBucketId} onChange={onBucketChange}>
                {unmatched && <option value="">영역 선택…</option>}
                {reqSet.buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            {!unmatched && !draft.bucketOverride && autoBucketId && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
                <Icon name="auto_awesome" className="text-[13px] text-blue" />
                자동 분류: {bucketLabel(reqSet, autoBucketId)}
              </p>
            )}
            {showErrors && errors.bucketOverride && <FieldError>{errors.bucketOverride}</FieldError>}
          </div>
        </div>

        {/* 상태 */}
        <div>
          <span className="mb-1.5 block text-[12px] font-bold text-ink-2">상태</span>
          <div role="radiogroup" aria-label="과목 상태" className="grid grid-cols-3 gap-2">
            {STATE_OPTIONS.map((o) => {
              const active = o.value === draft.state
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onStateChange(o.value)}
                  className={`rounded-block px-2 py-2.5 text-[12.5px] font-bold transition-colors ${
                    active
                      ? 'bg-navy text-white'
                      : 'border border-line bg-surface text-ink-3 hover:bg-bg-soft'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {stateDesc && (
            <div className="mt-1.5 flex items-start gap-2 rounded-block bg-bg-soft px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
              <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
              <p className="flex-1">{stateDesc}</p>
            </div>
          )}
        </div>

        {/* 성적 (완료·재수강일 때만) */}
        {graded && (
          <div>
            <span className="mb-1.5 block text-[12px] font-bold text-ink-2">
              성적{isRetake && ' (이전 성적 유지)'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {GRADE_OPTIONS.map((g) => {
                const active = g === draft.grade
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patch({ grade: g })}
                    className={`rounded-chip px-3 py-1.5 text-[12px] font-bold transition-colors ${
                      active ? 'bg-navy text-white' : 'bg-bg-soft text-ink-3 hover:bg-line-2'
                    }`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
            {showErrors && errors.grade && <FieldError>{errors.grade}</FieldError>}
          </div>
        )}

        {/* 재수강 연결 */}
        {draft.state === 'completed' && priorOptions.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-ink-2">
            <input
              type="checkbox"
              checked={retakeLinkOpen}
              onChange={(e) => {
                setRetakeLinkOpen(e.target.checked)
                if (!e.target.checked) patch({ retakeOf: null })
              }}
              className="h-4 w-4 accent-navy"
            />
            이 성적은 재수강 결과예요
          </label>
        )}
        {showRetakeSelect && (
          <div>
            <Field
              label="대체할 이전 과목"
              hint="선택한 이전 기록은 보존되지만 학점·평점 계산에서는 제외돼요."
            >
              <SelectField value={draft.retakeOf ?? ''} onChange={onPickPrior}>
                <option value="">이전 과목 선택…</option>
                {priorOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {semesterLabel(c.semester)} · {c.nameSnapshot}
                    {c.grade ? ` · ${c.grade}` : ''}
                  </option>
                ))}
              </SelectField>
            </Field>
            {showErrors && errors.retakeOf && <FieldError>{errors.retakeOf}</FieldError>}
          </div>
        )}

        {/* 학기 · 메모 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label="학기" hint="예: 2022-1 · 2022-2 · 2022-S(계절)">
              <TextField
                value={draft.semester}
                onChange={(v) => patch({ semester: v })}
                placeholder="2022-1"
                inputMode="text"
              />
            </Field>
            {showErrors && errors.semester && <FieldError>{errors.semester}</FieldError>}
          </div>
          <Field label="메모(선택)">
            <TextField
              value={draft.memo ?? ''}
              onChange={(v) => patch({ memo: v })}
              placeholder="비고"
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-orange">
      <Icon name="error" className="text-[13px]" />
      {children}
    </p>
  )
}
