import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Bucket,
  BucketGroup,
  CatalogEntry,
  Requirement,
  RequirementSet,
  RequirementType,
} from '../../../engine/index'
import {
  ALTERNATIVE_TYPES,
  APPLIES_MODES,
  BUCKET_GROUPS,
  REQUIREMENT_TYPES,
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
  hasBlockingIssues,
  joinScale,
  parseScale,
  removeAlternative,
  removeBucket,
  removeChoiceCourse,
  removeChoiceGroup,
  removeReqGroup,
  removeReqGroupCourse,
  removeRequiredCourse,
  removeRequirement,
  updateAlternative,
  updateBucket,
  updateChoiceGroup,
  updateReqGroup,
  updateRequirement,
  validateReqSet,
  type AppliesMode,
} from '../../reqset-editor'
import { buildSearchDocs, type SearchDoc } from '../../search'
import { Button, Icon, Modal } from '../../ui'
import { Field, NumberField, SelectField, TextField } from '../../onboarding/fields'
import { CoursePicker } from './CoursePicker'

type Updater = (fn: (s: RequirementSet) => RequirementSet) => void

interface Props {
  open: boolean
  /** 편집 작업본(프리셋은 startEdit로 이미 복제됨). 열려 있는 동안 안정적으로 전달할 것. */
  initialSet: RequirementSet
  catalog: CatalogEntry[]
  onClose: () => void
  onSubmit: (set: RequirementSet) => void
}

/**
 * 요건 세트 전용 편집 모달 — 세트 정보 + 영역(학점 요건) + 비교과 요건 정의.
 * 저장하면 항상 커스텀 세트로 남는다(프리셋 불변). 요건 숫자는 전부 여기서 데이터로 편집한다.
 */
export function ReqSetEditorModal({ open, initialSet, catalog, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<RequirementSet>(initialSet)
  const wasOpen = useRef(false)

  // 열릴 때 1회만 작업본을 주입(모달은 마운트된 채 open만 토글).
  useEffect(() => {
    if (open && !wasOpen.current) setDraft(initialSet)
    wasOpen.current = open
  }, [open, initialSet])

  const docs = useMemo(() => buildSearchDocs(catalog), [catalog])
  const issues = useMemo(() => validateReqSet(draft), [draft])
  const blocking = hasBlockingIssues(issues)

  const up: Updater = (fn) => setDraft(fn)

  const source = draft.source as Record<string, unknown> | undefined
  const isClone = !!(source?.['basePresetId'] || source?.['customizedInEditor'] || source?.['clonedFrom'])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="요건 세트 편집"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" icon="check" onClick={() => onSubmit(draft)} disabled={blocking}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {isClone && (
          <div className="flex items-start gap-2 rounded-block bg-blue/[0.06] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
            <Icon name="edit_note" className="mt-px shrink-0 text-[15px] text-blue" />
            <p>
              원본 프리셋은 그대로 두고 <b>내 편집본</b>(커스텀 세트)에 저장돼요. 다른 학번용 세트를
              만들 땐 학점·이름을 그대로 베끼지 말고 요람과 대조해 고치세요.
            </p>
          </div>
        )}

        {/* ── 세트 정보 ── */}
        <Section title="세트 정보">
          <div className="flex flex-col gap-3">
            <Field label="세트 이름">
              <TextField value={draft.name} onChange={(v) => up((s) => ({ ...s, name: v }))} placeholder="예: 2025 소프트웨어학과 · 심화" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="졸업 총 학점">
                <NumberField
                  value={draft.totalCredits}
                  onChange={(v) => up((s) => ({ ...s, totalCredits: v ?? 0 }))}
                  min={0}
                  suffix="학점"
                />
              </Field>
              <Field label="졸업 최저 평점">
                <NumberField
                  value={draft.minGPA}
                  onChange={(v) => up((s) => ({ ...s, minGPA: v ?? 0 }))}
                  min={0}
                  step={0.1}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="입학년도(학번)">
                <NumberField
                  value={draft.admissionYearFrom ?? null}
                  onChange={(v) =>
                    up((s) => ({ ...s, admissionYearFrom: v ?? undefined, admissionYearTo: v ?? undefined }))
                  }
                  min={0}
                  placeholder="2021"
                />
              </Field>
              <Field label="학과">
                <TextField
                  value={draft.department ?? ''}
                  onChange={(v) => up((s) => ({ ...s, department: v }))}
                  placeholder="소프트웨어학과"
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* ── 영역(학점 요건) ── */}
        <Section
          title="영역 (학점 요건)"
          hint="전공필수·전공선택·교양 등 학점 영역"
          action={
            <AddButton onClick={() => up((s) => addBucket(s, blankBucket(s)))}>영역 추가</AddButton>
          }
        >
          {draft.buckets.length === 0 ? (
            <EmptyHint>아직 영역이 없어요. ‘영역 추가’로 전공필수·교양 등을 만들어 보세요.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.buckets.map((b) => (
                <BucketEditorCard key={b.id} bucket={b} docs={docs} catalog={catalog} update={up} />
              ))}
            </div>
          )}
        </Section>

        {/* ── 비교과 요건 ── */}
        <Section
          title="비교과 요건"
          hint="영어 인증·전공역량·산학프로젝트 등"
          action={
            <AddButton onClick={() => up((s) => addRequirement(s, blankRequirement(s)))}>
              요건 추가
            </AddButton>
          }
        >
          {draft.nonCurricular.length === 0 ? (
            <EmptyHint>비교과 요건이 없어요. 필요하면 ‘요건 추가’로 만드세요.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.nonCurricular.map((r) => (
                <RequirementEditorCard key={r.id} req={r} docs={docs} catalog={catalog} update={up} />
              ))}
            </div>
          )}
        </Section>

        {/* ── 검증 결과 ── */}
        {issues.length > 0 && (
          <div className="rounded-block border border-line p-3.5">
            <div className="mb-1.5 text-[11.5px] font-bold text-ink-2">확인해 주세요</div>
            <ul className="flex flex-col gap-1">
              {issues.map((iss, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${
                    iss.level === 'error' ? 'text-orange' : 'text-ink-3'
                  }`}
                >
                  <Icon
                    name={iss.level === 'error' ? 'error' : 'info'}
                    className="mt-px shrink-0 text-[14px]"
                  />
                  <span>{iss.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────
// 영역 편집 카드
// ────────────────────────────────────────────────────────────

function BucketEditorCard({
  bucket,
  docs,
  catalog,
  update,
}: {
  bucket: Bucket
  docs: SearchDoc[]
  catalog: CatalogEntry[]
  update: Updater
}) {
  const [open, setOpen] = useState(false)
  const b = bucket
  const patch = (p: Partial<Bucket>) => update((s) => updateBucket(s, b.id, p))
  const hasAdvanced = (b.areas?.length ?? 0) > 0 || b.creditCap != null || b.minDistinctAreas != null

  return (
    <div className="rounded-block border border-line bg-surface">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? '접기' : '펼치기'}
          className="shrink-0 rounded-chip p-1 text-muted-2 hover:bg-bg-soft hover:text-ink-2"
        >
          <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[18px]" />
        </button>
        <input
          type="text"
          value={b.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="영역 이름"
          aria-label="영역 이름"
          className="min-w-0 flex-1 rounded-block border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
        />
        <div className="relative w-24 shrink-0">
          <input
            type="number"
            value={b.minCredits}
            min={0}
            onChange={(e) => patch({ minCredits: e.target.value === '' ? 0 : Number(e.target.value) })}
            aria-label={`${b.label || '영역'} 최소 학점`}
            className="w-full rounded-block border border-line bg-surface py-2 pl-3 pr-8 text-[13px] font-medium text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold text-muted-2">
            학점
          </span>
        </div>
        <button
          type="button"
          onClick={() => update((s) => removeBucket(s, b.id))}
          aria-label={`${b.label || '영역'} 삭제`}
          className="shrink-0 rounded-chip p-1.5 text-muted-2 hover:bg-orange/10 hover:text-orange"
        >
          <Icon name="delete" className="text-[17px]" />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-line-2 px-3 py-3.5">
          <Field label="구분">
            <SelectField value={b.group} onChange={(v) => patch({ group: v as BucketGroup })}>
              {BUCKET_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </SelectField>
          </Field>

          <div>
            <SubLabel>필수 과목</SubLabel>
            <CoursePicker
              courseKeys={b.requiredCourses ?? []}
              catalog={catalog}
              docs={docs}
              onAdd={(k) => update((s) => addRequiredCourse(s, b.id, k))}
              onRemove={(k) => update((s) => removeRequiredCourse(s, b.id, k))}
              emptyHint="이 영역에서 반드시 들어야 하는 과목을 검색해 추가하세요(없으면 비워둬도 돼요)."
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SubLabel>택1 그룹</SubLabel>
              <AddButton onClick={() => update((s) => addChoiceGroup(s, b.id))}>그룹 추가</AddButton>
            </div>
            {(b.choiceGroups ?? []).length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-2">
                여러 과목 중 정해진 개수만 들으면 되는 경우(예: 확률및통계2 또는 선형대수1) 그룹을 추가하세요.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(b.choiceGroups ?? []).map((g) => (
                  <div key={g.id} className="rounded-block bg-bg-soft p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g.label}
                        onChange={(e) => update((s) => updateChoiceGroup(s, b.id, g.id, { label: e.target.value }))}
                        placeholder="그룹 이름"
                        aria-label="택1 그룹 이름"
                        className="min-w-0 flex-1 rounded-chip border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink outline-none focus:border-blue"
                      />
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-ink-3">
                        택
                        <input
                          type="number"
                          value={g.pick}
                          min={1}
                          onChange={(e) =>
                            update((s) =>
                              updateChoiceGroup(s, b.id, g.id, {
                                pick: e.target.value === '' ? 1 : Number(e.target.value),
                              }),
                            )
                          }
                          aria-label="선택 수"
                          className="w-12 rounded-chip border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-blue"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => update((s) => removeChoiceGroup(s, b.id, g.id))}
                        aria-label="그룹 삭제"
                        className="shrink-0 rounded-chip p-1 text-muted-2 hover:bg-orange/10 hover:text-orange"
                      >
                        <Icon name="delete" className="text-[15px]" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <CoursePicker
                        courseKeys={g.courses}
                        catalog={catalog}
                        docs={docs}
                        onAdd={(k) => update((s) => addChoiceCourse(s, b.id, g.id, k))}
                        onRemove={(k) => update((s) => removeChoiceCourse(s, b.id, g.id, k))}
                        emptyHint="이 그룹에서 고를 수 있는 과목들을 추가하세요."
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasAdvanced && (
            <p className="flex items-start gap-1.5 rounded-block bg-bg-soft px-3 py-2 text-[11px] leading-relaxed text-ink-3">
              <Icon name="info" className="mt-px shrink-0 text-[13px] text-blue" />
              이 영역엔 영역별교양(서로 다른 영역)·학점 상한 같은 고급 설정이 있어요. 편집기에서 그 값은
              그대로 유지되며, 정밀 수정은 JSON 공유로 다뤄요.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 비교과 요건 편집 카드
// ────────────────────────────────────────────────────────────

function RequirementEditorCard({
  req,
  docs,
  catalog,
  update,
}: {
  req: Requirement
  docs: SearchDoc[]
  catalog: CatalogEntry[]
  update: Updater
}) {
  const [open, setOpen] = useState(false)
  const patch = (p: Partial<Requirement>) => update((s) => updateRequirement(s, req.id, p))
  const typeLabel = REQUIREMENT_TYPES.find((t) => t.value === req.type)?.label ?? req.type

  return (
    <div className="rounded-block border border-line bg-surface">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? '접기' : '펼치기'}
          className="shrink-0 rounded-chip p-1 text-muted-2 hover:bg-bg-soft hover:text-ink-2"
        >
          <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[18px]" />
        </button>
        <input
          type="text"
          value={req.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="요건 이름"
          aria-label="비교과 요건 이름"
          className="min-w-0 flex-1 rounded-block border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
        />
        <span className="hidden shrink-0 rounded-chip bg-bg-soft px-2 py-1 text-[10.5px] font-semibold text-muted sm:inline">
          {typeLabel}
        </span>
        <button
          type="button"
          onClick={() => update((s) => removeRequirement(s, req.id))}
          aria-label={`${req.label || '요건'} 삭제`}
          className="shrink-0 rounded-chip p-1.5 text-muted-2 hover:bg-orange/10 hover:text-orange"
        >
          <Icon name="delete" className="text-[17px]" />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-line-2 px-3 py-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="유형">
              <SelectField
                value={req.type}
                onChange={(v) => update((s) => changeRequirementType(s, req.id, v as RequirementType))}
              >
                {REQUIREMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="적용 대상">
              <SelectField
                value={appliesModeOf(req.appliesWhen)}
                onChange={(v) => {
                  // 'custom'(표현 불가한 원본 조건)은 그대로 두고 덮어쓰지 않는다.
                  if (v === 'custom') return
                  patch({ appliesWhen: appliesCondOf(v as AppliesMode) })
                }}
              >
                {appliesModeOf(req.appliesWhen) === 'custom' && (
                  <option value="custom">기타(원본 조건 유지)</option>
                )}
                {APPLIES_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>

          <TypeFields req={req} patch={patch} docs={docs} catalog={catalog} update={update} />
        </div>
      )}
    </div>
  )
}

/** 요건 유형별 세부 입력(기준값·택1 시험·과목군). */
function TypeFields({
  req,
  patch,
  docs,
  catalog,
  update,
}: {
  req: Requirement
  patch: (p: Partial<Requirement>) => void
  docs: SearchDoc[]
  catalog: CatalogEntry[]
  update: Updater
}) {
  switch (req.type) {
    case 'check':
      return <Hint>완료/미완료만 확인하는 요건이에요. 추가 기준값이 없어요.</Hint>

    case 'count':
    case 'score':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={req.type === 'count' ? '필요 횟수' : '기준 점수'}>
            <NumberField
              value={typeof req.min === 'number' ? req.min : null}
              onChange={(v) => patch({ min: v ?? undefined })}
              min={0}
            />
          </Field>
          <Field label="단위">
            <TextField
              value={req.unit ?? ''}
              onChange={(v) => patch({ unit: v || undefined })}
              placeholder={req.type === 'count' ? '회' : '점'}
            />
          </Field>
        </div>
      )

    case 'level':
      return (
        <ScaleEditor
          scale={req.scale}
          min={req.min}
          onScale={(sc) => patch({ scale: sc })}
          onMin={(v) => patch({ min: v || undefined })}
        />
      )

    case 'alternatives':
      return (
        <div className="flex flex-col gap-3">
          <div className="w-40">
            <Field label="충족 개수(택N)">
              <NumberField value={req.pick ?? 1} onChange={(v) => patch({ pick: v ?? 1 })} min={1} />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SubLabel>시험 항목</SubLabel>
              <AddButton onClick={() => update((s) => addAlternative(s, req.id))}>항목 추가</AddButton>
            </div>
            {(req.alternatives ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-2">TOEIC·TEPS처럼 인정되는 시험들을 추가하세요.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(req.alternatives ?? []).map((alt) => (
                  <div key={alt.id} className="flex flex-wrap items-center gap-2 rounded-block bg-bg-soft p-2">
                    <input
                      type="text"
                      value={alt.label}
                      onChange={(e) => update((s) => updateAlternative(s, req.id, alt.id, { label: e.target.value }))}
                      placeholder="시험 이름"
                      aria-label="시험 이름"
                      className="min-w-[120px] flex-1 rounded-chip border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink outline-none focus:border-blue"
                    />
                    <select
                      value={alt.type}
                      onChange={(e) =>
                        update((s) =>
                          changeAlternativeType(s, req.id, alt.id, e.target.value as 'check' | 'score' | 'level'),
                        )
                      }
                      aria-label="시험 유형"
                      className="shrink-0 rounded-chip border border-line bg-surface px-2 py-1.5 text-[12px] text-ink-2 outline-none focus:border-blue"
                    >
                      {ALTERNATIVE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {alt.type === 'score' && (
                      <input
                        type="number"
                        value={alt.min != null ? String(alt.min) : ''}
                        onChange={(e) => {
                          const raw = e.target.value
                          update((s) =>
                            updateAlternative(s, req.id, alt.id, { min: raw === '' ? undefined : Number(raw) }),
                          )
                        }}
                        placeholder="기준"
                        aria-label="기준 점수"
                        className="w-20 shrink-0 rounded-chip border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-blue"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => update((s) => removeAlternative(s, req.id, alt.id))}
                      aria-label="시험 삭제"
                      className="shrink-0 rounded-chip p-1 text-muted-2 hover:bg-orange/10 hover:text-orange"
                    >
                      <Icon name="delete" className="text-[15px]" />
                    </button>
                    {alt.type === 'level' && (
                      <div className="flex basis-full items-center gap-2">
                        <input
                          type="text"
                          value={joinScale(alt.scale)}
                          onChange={(e) =>
                            update((s) => updateAlternative(s, req.id, alt.id, { scale: parseScale(e.target.value) }))
                          }
                          placeholder="등급 단계(낮은→높은): IL, IM, IH, AL"
                          aria-label="등급 단계"
                          className="min-w-0 flex-1 rounded-chip border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-blue"
                        />
                        <select
                          value={(alt.scale ?? []).includes(String(alt.min)) ? String(alt.min) : ''}
                          onChange={(e) =>
                            update((s) => updateAlternative(s, req.id, alt.id, { min: e.target.value || undefined }))
                          }
                          aria-label="기준 등급"
                          className="w-24 shrink-0 rounded-chip border border-line bg-surface px-2 py-1.5 text-[12px] text-ink-2 outline-none focus:border-blue"
                        >
                          <option value="">기준…</option>
                          {(alt.scale ?? []).map((lv) => (
                            <option key={lv} value={lv}>
                              {lv}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )

    case 'courseGroupPick':
      return (
        <div className="flex flex-col gap-3">
          <div className="w-40">
            <Field label="이수 과목군 수">
              <NumberField value={req.pick ?? 1} onChange={(v) => patch({ pick: v ?? 1 })} min={1} />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SubLabel>과목군</SubLabel>
              <AddButton onClick={() => update((s) => addReqGroup(s, req.id))}>과목군 추가</AddButton>
            </div>
            {(req.groups ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-2">캡스톤·현장실습 등 과목군을 추가하고 과목을 담으세요.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(req.groups ?? []).map((g) => (
                  <div key={g.id} className="rounded-block bg-bg-soft p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g.label}
                        onChange={(e) => update((s) => updateReqGroup(s, req.id, g.id, { label: e.target.value }))}
                        placeholder="과목군 이름"
                        aria-label="과목군 이름"
                        className="min-w-0 flex-1 rounded-chip border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink outline-none focus:border-blue"
                      />
                      <button
                        type="button"
                        onClick={() => update((s) => removeReqGroup(s, req.id, g.id))}
                        aria-label="과목군 삭제"
                        className="shrink-0 rounded-chip p-1 text-muted-2 hover:bg-orange/10 hover:text-orange"
                      >
                        <Icon name="delete" className="text-[15px]" />
                      </button>
                    </div>
                    <div className="mt-2">
                      <CoursePicker
                        courseKeys={g.courses}
                        catalog={catalog}
                        docs={docs}
                        onAdd={(k) => update((s) => addReqGroupCourse(s, req.id, g.id, k))}
                        onRemove={(k) => update((s) => removeReqGroupCourse(s, req.id, g.id, k))}
                        emptyHint="이 과목군에 속하는 과목들을 추가하세요."
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )

    default:
      return null
  }
}

// ────────────────────────────────────────────────────────────
// 작은 조각
// ────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          {hint && <p className="text-[11px] text-muted-2">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function SubLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] font-bold text-ink-2">{children}</span>
}

/** 등급(level) 유형의 스케일·기준 편집. 스케일이 있으면 기준은 그 안에서만 고른다. */
function ScaleEditor({
  scale,
  min,
  onScale,
  onMin,
}: {
  scale?: string[]
  min?: number | string
  onScale: (s: string[]) => void
  onMin: (v: string) => void
}) {
  const list = scale ?? []
  const minStr = min != null ? String(min) : ''
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="등급 단계(낮은→높은)" hint="쉼표로 구분. 예: NL, NM, NH, IL, IM, IH, AL">
        <TextField value={joinScale(scale)} onChange={(v) => onScale(parseScale(v))} placeholder="IL, IM, IH, AL" />
      </Field>
      <Field label="기준 등급">
        {list.length > 0 ? (
          <SelectField value={list.includes(minStr) ? minStr : ''} onChange={onMin}>
            <option value="">선택…</option>
            {list.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField value={minStr} onChange={onMin} placeholder="먼저 등급 단계를 입력하세요" />
        )}
      </Field>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-block bg-bg-soft px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
      <Icon name="info" className="mt-px shrink-0 text-[13px] text-blue" />
      {children}
    </p>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-block border border-dashed border-line px-3.5 py-4 text-center text-[12px] leading-relaxed text-muted-2">
      {children}
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-[11.5px] font-bold text-blue hover:bg-blue/10"
    >
      <Icon name="add" className="text-[15px]" />
      {children}
    </button>
  )
}
