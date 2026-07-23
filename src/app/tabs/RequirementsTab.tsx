import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../AppState'
import { requirementSetRegistry } from '../../data/index'
import { BUCKET_GROUPS, customIdFor, startEdit } from '../reqset-editor'
import { normalizeReqSetGroups } from '../dataSources'
import { areaPolicyOf, excludedAreaOf } from '../../data/merge'
import { AreaExcludedBadge } from './courses/AreaExcludedBadge'
import { supersededIds, type BucketResult, type Course, type RequirementSet } from '../../engine/index'
import { semesterSortKey } from '../courses'
import { Button, Card, Icon, Modal } from '../ui'
import { TextField } from '../onboarding/fields'
import { NonCurricularChecklist } from './requirements/NonCurricularChecklist'
import { ReqSetEditorModal } from './requirements/ReqSetEditorModal'
import { StatusBadge } from './courses/StatusBadge'

const TRACK_LABEL: Record<string, string> = {
  advanced: '심화과정',
  general: '일반과정',
  accredited: '공학인증',
}

type Dialog = 'none' | 'clone' | 'switch'

/**
 * 요건 탭 — 영역별 진행(읽기) + 비교과 체크리스트(입력) + 요건 세트 복제·전환·편집.
 * 요건 숫자는 전부 세트(데이터)에서 온다. 프리셋은 편집 시 커스텀으로 복제한다.
 */
export function RequirementsTab() {
  const {
    state,
    input,
    result,
    reqSet,
    setNonCurricular,
    saveEditedReqSet,
    cloneActiveReqSet,
    switchReqSet,
    deleteCustomSet,
    setActiveTab,
  } = useAppState()

  const [editorSet, setEditorSet] = useState<RequirementSet | null>(null)
  const [dialog, setDialog] = useState<Dialog>('none')

  // 영역(bucket)별로 귀속 과목을 모은다 — 학점 요건에서 "어떤 과목이 이 영역에 들어갔는지" 펼쳐 보기용.
  // 엔진이 확정한 resolved.bucketId를 그대로 신뢰(규칙 1·4). 재수강으로 대체된 기록은 제외한다.
  const coursesByBucket = useMemo(() => {
    const dead = supersededIds(state.courses)
    const map = new Map<string, Course[]>()
    for (const rc of result?.resolved ?? []) {
      if (dead.has(rc.course.id)) continue
      const list = map.get(rc.bucketId)
      if (list) list.push(rc.course)
      else map.set(rc.bucketId, [rc.course])
    }
    // 학기 오름차순(이수 흐름대로) → 과목명 순.
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          semesterSortKey(a.semester) - semesterSortKey(b.semester) ||
          (a.nameSnapshot < b.nameSnapshot ? -1 : a.nameSnapshot > b.nameSnapshot ? 1 : 0),
      )
    }
    return map
  }, [result, state.courses])

  // 소속 계열 제외 영역 과목(일반선택으로 귀속된 교양)에 사유를 붙이기 위한 과목 id → 영역 id.
  const excludedAreaById = useMemo(() => {
    const policy = reqSet ? areaPolicyOf(reqSet) : null
    const map = new Map<string, string>()
    if (!policy) return map
    for (const rc of result?.resolved ?? []) {
      const area = excludedAreaOf(rc.catalog, policy)
      if (area) map.set(rc.course.id, area)
    }
    return map
  }, [result, reqSet])

  if (!reqSet || !result || !input) return null

  const isCustom = state.customSets.some((s) => s.id === reqSet.id)
  const meta = [
    reqSet.admissionYearFrom ? `${reqSet.admissionYearFrom}학번` : null,
    reqSet.department,
    TRACK_LABEL[reqSet.trackType] ?? reqSet.trackType,
  ]
    .filter(Boolean)
    .join(' · ')

  function openEditor() {
    const active = reqSet!
    const now = new Date().toISOString()
    if (isCustom) {
      setEditorSet(startEdit(active, false, active.id, now))
      return
    }
    // 이 프리셋으로 만든 편집본이 이미 있으면 그걸 이어서 편집한다
    // (프리셋↔편집본을 오가며 편집할 때 '(내 편집본)' 세트가 중복 누적되는 것 방지).
    const existing = state.customSets.find((s) => {
      const src = s.source as Record<string, unknown> | undefined
      return src?.['customizedInEditor'] === true && src?.['basePresetId'] === active.id
    })
    if (existing) {
      // 구버전 그룹 값(major/free)이 편집기 그룹 셀렉트와 어긋나지 않게 정규화 후 편집.
      setEditorSet(startEdit(normalizeReqSetGroups(existing), false, existing.id, now))
      return
    }
    const newId = customIdFor(active.id, state.customSets.map((s) => s.id))
    setEditorSet(startEdit(active, true, newId, now))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 세트 헤더: 전환 · 복제 · 편집 ── */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDialog('switch')}
            className="group -m-1 flex min-w-0 items-center gap-2 rounded-block p-1 text-left hover:bg-bg-soft"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-block bg-navy/5 text-navy">
              <Icon name="school" className="text-[20px]" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="truncate text-[14px] font-bold text-ink">{reqSet.name}</span>
                <Icon name="unfold_more" className="shrink-0 text-[16px] text-muted-2" />
                <span
                  className={`shrink-0 rounded-chip px-1.5 py-0.5 text-[10px] font-bold ${
                    isCustom ? 'bg-blue/10 text-blue' : 'bg-bg-soft text-muted'
                  }`}
                >
                  {isCustom ? '내 세트' : '기본 제공'}
                </span>
              </span>
              {meta && <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{meta}</span>}
            </span>
          </button>

          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" icon="content_copy" onClick={() => setDialog('clone')}>
              세트 복제
            </Button>
            <Button variant="primary" icon="edit" onClick={openEditor}>
              세트 편집
            </Button>
          </div>
        </div>
      </Card>

      {/* ── 본문: 학점 요건 + 비교과 체크리스트 ── */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <CreditRequirements
          buckets={result.buckets}
          coursesByBucket={coursesByBucket}
          excludedAreaById={excludedAreaById}
          onEdit={openEditor}
        />

        <div className="flex flex-col gap-4">
          <NonCurricularChecklist
            requirements={reqSet.nonCurricular}
            results={result.nonCurricular}
            state={state.noncurricular}
            onChange={setNonCurricular}
          />
          <DataShareCard onGoSettings={() => setActiveTab('settings')} />
        </div>
      </div>

      {/* 참고용 고지 */}
      <div className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
        <Icon name="info" className="mt-px text-[15px]" />
        <p>
          요건 숫자는 요람과 다를 수 있어요. <b className="text-ink-2">세트 편집</b>에서 직접 고칠 수
          있고, 최종 졸업 여부는 포털·학과사무실에서 확인하세요.
        </p>
      </div>

      {/* ── 모달 ── */}
      <ReqSetEditorModal
        open={editorSet != null}
        initialSet={editorSet ?? reqSet}
        catalog={input.catalog}
        onClose={() => setEditorSet(null)}
        onSubmit={(set) => {
          saveEditedReqSet(set)
          setEditorSet(null)
        }}
      />

      <CloneDialog
        open={dialog === 'clone'}
        defaultName={`${reqSet.name} 사본`}
        onClose={() => setDialog('none')}
        onConfirm={(name) => {
          cloneActiveReqSet(name)
          setDialog('none')
        }}
      />

      <SwitchModal
        open={dialog === 'switch'}
        currentId={reqSet.id}
        customSets={state.customSets}
        onSwitch={(id) => {
          switchReqSet(id)
          setDialog('none')
        }}
        onDelete={deleteCustomSet}
        onClose={() => setDialog('none')}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 학점 요건(읽기)
// ────────────────────────────────────────────────────────────

// 카테고리(영역 그룹) 정렬 순서·라벨 — 편집기 그룹 정의(단일 출처)에서 파생.
const GROUP_ORDER: string[] = BUCKET_GROUPS.map((g) => g.value)
const GROUP_LABEL: Record<string, string> = Object.fromEntries(
  BUCKET_GROUPS.map((g) => [g.value, g.label]),
)

interface CategoryGroup {
  group: string
  label: string
  buckets: BucketResult[]
  earned: number
  required: number
  rate: number
  satisfied: boolean
}

/**
 * 영역을 카테고리(대학필수·학과필수·전공필수·전공선택·일반선택)로 묶는다.
 * 카테고리 순서는 편집기 그룹 정의를 따르고, 미등록 그룹은 뒤에 선언 순서대로 붙인다.
 * 학점은 합산, 충족은 하위 영역이 모두 충족일 때만 참(부분 충족은 미충족으로 보수적 표시).
 */
function groupByCategory(buckets: BucketResult[]): CategoryGroup[] {
  const byGroup = new Map<string, BucketResult[]>()
  for (const b of buckets) {
    const list = byGroup.get(b.group)
    if (list) list.push(b)
    else byGroup.set(b.group, [b])
  }
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g)
    return i < 0 ? GROUP_ORDER.length : i
  }
  return [...byGroup.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((group) => {
      const list = byGroup.get(group)!
      const earned = list.reduce((s, b) => s + b.earned, 0)
      const required = list.reduce((s, b) => s + b.required, 0)
      return {
        group,
        label: GROUP_LABEL[group] ?? group,
        buckets: list,
        earned,
        required,
        rate: required > 0 ? Math.min(earned / required, 1) : 1,
        satisfied: list.every((b) => b.satisfied),
      }
    })
}

function CreditRequirements({
  buckets,
  coursesByBucket,
  excludedAreaById,
  onEdit,
}: {
  buckets: BucketResult[]
  coursesByBucket: Map<string, Course[]>
  excludedAreaById: Map<string, string>
  onEdit: () => void
}) {
  const categories = useMemo(() => groupByCategory(buckets), [buckets])
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13.5px] font-bold text-ink">학점 요건</div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue hover:text-navy"
        >
          <Icon name="edit" className="text-[14px]" />
          영역 편집
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-block border border-dashed border-line px-4 py-8 text-center">
          <p className="text-[13px] font-semibold text-ink-2">아직 영역이 없어요</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            세트 편집에서 전공필수·교양 같은 영역과 필요 학점을 추가하세요.
          </p>
          <div className="mt-3">
            <Button variant="secondary" icon="add" onClick={onEdit}>
              영역 추가하기
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line-2">
          {categories.map((cat) => (
            <CategoryRow
              key={cat.group}
              cat={cat}
              coursesByBucket={coursesByBucket}
              excludedAreaById={excludedAreaById}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * 카테고리 한 줄 — 합산 진행률만 보이고, 펼치면 하위 영역(영역별교양 규칙·과목 포함)을 편다.
 * 색 단독 금지 → 라벨·수치·아이콘 병기. 충족=green / 저조(<50%)=orange / 그 외=navy.
 */
function CategoryRow({
  cat,
  coursesByBucket,
  excludedAreaById,
}: {
  cat: CategoryGroup
  coursesByBucket: Map<string, Course[]>
  excludedAreaById: Map<string, string>
}) {
  const [open, setOpen] = useState(false)
  const pct = Math.round(Math.min(cat.rate, 1) * 100)
  const barColor = cat.satisfied ? 'bg-green' : cat.rate < 0.5 ? 'bg-orange' : 'bg-navy'
  const panelId = `category-${cat.group}`
  // 펼치기 전에도 어떤 영역이 묶였는지 미리보기(라벨 나열) + 남은 영역 수.
  const subLabels = cat.buckets.map((b) => b.label).join(' · ')
  const unmet = cat.buckets.filter((b) => !b.satisfied).length

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="mb-1.5 flex w-full items-start justify-between gap-2 rounded-block text-left transition-colors hover:text-ink"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-[13px] font-bold text-ink-2">{cat.label}</span>
            {cat.satisfied && <Icon name="check_circle" className="shrink-0 text-[14px] text-green" />}
          </div>
          <div className="truncate text-[10.5px] text-muted-2">{subLabels}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`text-[12px] ${cat.satisfied ? 'font-semibold text-green' : 'text-muted'}`}>
            <b className="text-ink-2">{cat.earned}</b> / {cat.required}
          </span>
          <Icon
            name="expand_more"
            className={`text-[18px] text-muted-2 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <div
        className="h-[7px] overflow-hidden rounded-full bg-line-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${cat.earned} / ${cat.required}학점`}
        aria-label={`${cat.label} 진행률`}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {!open && !cat.satisfied && unmet > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-3">{unmet}개 영역 남음 · 펼쳐서 확인</p>
      )}

      {open && (
        <div id={panelId} className="mt-3 flex flex-col gap-3 border-l-2 border-line-2 pl-3">
          {cat.buckets.map((b) => (
            <SubBucket
              key={b.id}
              b={b}
              courses={coursesByBucket.get(b.id) ?? []}
              excludedAreaById={excludedAreaById}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 카테고리 안 하위 영역 하나 — 진행률·미충족 사유·귀속 과목. */
function SubBucket({
  b,
  courses,
  excludedAreaById,
}: {
  b: BucketResult
  courses: Course[]
  excludedAreaById: Map<string, string>
}) {
  const pct = Math.round(Math.min(b.rate, 1) * 100)
  const barColor = b.satisfied ? 'bg-green' : b.rate < 0.5 ? 'bg-orange' : 'bg-navy'
  const reasons = b.reasons.filter((r) => r.trim().length > 0)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[12.5px] font-semibold text-ink-2">{b.label}</span>
          {b.satisfied && <Icon name="check_circle" className="shrink-0 text-[13px] text-green" />}
        </span>
        <span
          className={`shrink-0 text-[11.5px] ${b.satisfied ? 'font-semibold text-green' : 'text-muted'}`}
        >
          <b className="text-ink-2">{b.earned}</b> / {b.required}
        </span>
      </div>
      <div
        className="h-[6px] overflow-hidden rounded-full bg-line-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${b.earned} / ${b.required}학점`}
        aria-label={`${b.label} 진행률`}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {!b.satisfied && reasons.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{reasons.join(' · ')}</p>
      )}
      {courses.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {courses.map((c) => {
            const excludedArea = excludedAreaById.get(c.id)
            return (
              <li key={c.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">
                  {c.nameSnapshot}
                </span>
                {excludedArea && <AreaExcludedBadge areaId={excludedArea} compact />}
                <span className="shrink-0 text-[10.5px] tabular-nums text-muted-2">
                  {c.credits}학점
                </span>
                <StatusBadge course={c} dead={false} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// "요건은 데이터입니다" 안내
// ────────────────────────────────────────────────────────────

function DataShareCard({ onGoSettings }: { onGoSettings: () => void }) {
  return (
    <Card className="border-blue/15 bg-blue/[0.03] p-5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-navy">
        <Icon name="data_object" className="text-[17px]" />
        요건은 데이터입니다
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-3">
        이 세트 전체가 하나의 JSON이에요. 내보내면 선배가 후배에게 텍스트로 전달할 수 있고,
        불러오면 그대로 시작할 수 있어요.
      </p>
      <button
        type="button"
        onClick={onGoSettings}
        className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-bold text-blue hover:text-navy"
      >
        <Icon name="share" className="text-[15px]" />
        설정에서 세트 공유하기
      </button>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────
// 복제 다이얼로그
// ────────────────────────────────────────────────────────────

function CloneDialog({
  open,
  defaultName,
  onClose,
  onConfirm,
}: {
  open: boolean
  defaultName: string
  onClose: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="세트 복제"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" icon="content_copy" onClick={() => onConfirm(name)}>
            복제하고 전환
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          현재 세트를 그대로 복사해 새 세트를 만들어요. 복제 후 편집에서 다른 학번·학점으로 고치면 돼요.
        </p>
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink-2" htmlFor="clone-name">
            새 세트 이름
          </label>
          <TextField id="clone-name" value={name} onChange={setName} placeholder="예: 2025 소프트웨어학과 · 심화" />
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────
// 세트 전환 · 관리
// ────────────────────────────────────────────────────────────

function SwitchModal({
  open,
  currentId,
  customSets,
  onSwitch,
  onDelete,
  onClose,
}: {
  open: boolean
  currentId: string
  customSets: RequirementSet[]
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const presets = Object.values(requirementSetRegistry)
  return (
    <Modal open={open} onClose={onClose} title="요건 세트 전환">
      <div className="flex flex-col gap-4" role="radiogroup" aria-label="요건 세트 선택">
        <p className="text-[12px] leading-relaxed text-ink-3">
          쓸 요건 세트를 고르세요. 전환해도 입력한 과목·비교과 진행은 그대로 유지돼요.
        </p>

        {customSets.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">내 세트</div>
            <ul className="flex flex-col gap-1.5">
              {customSets.map((s) => (
                <SetRow
                  key={s.id}
                  set={s}
                  active={s.id === currentId}
                  onSwitch={() => onSwitch(s.id)}
                  onDelete={s.id === currentId ? undefined : () => onDelete(s.id)}
                />
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">기본 제공</div>
          <ul className="flex flex-col gap-1.5">
            {presets.map((s) => (
              <SetRow key={s.id} set={s} active={s.id === currentId} onSwitch={() => onSwitch(s.id)} />
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

function SetRow({
  set,
  active,
  onSwitch,
  onDelete,
}: {
  set: RequirementSet
  active: boolean
  onSwitch: () => void
  onDelete?: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={active ? undefined : onSwitch}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-block border px-3 py-2.5 text-left transition-colors ${
          active
            ? 'border-navy/30 bg-blue/[0.05]'
            : 'cursor-pointer border-line bg-surface hover:bg-bg-soft'
        }`}
      >
        <Icon
          name={active ? 'radio_button_checked' : 'radio_button_unchecked'}
          className={`shrink-0 text-[18px] ${active ? 'text-navy' : 'text-muted-2'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink-2">{set.name}</span>
          <span className="block truncate text-[10.5px] text-muted-2">
            총 {set.totalCredits}학점 · 영역 {set.buckets.length}개
          </span>
        </span>
        {active && (
          <span className="shrink-0 rounded-chip bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white">
            사용 중
          </span>
        )}
      </button>

      {onDelete && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`${set.name} 삭제`}
          className="shrink-0 rounded-block p-2 text-muted-2 hover:bg-orange/10 hover:text-orange"
        >
          <Icon name="delete" className="text-[18px]" />
        </button>
      )}
      {onDelete && confirming && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onDelete()
              setConfirming(false)
            }}
            className="rounded-block bg-orange/10 px-2 py-1.5 text-[11px] font-bold text-orange hover:bg-orange/20"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-block px-2 py-1.5 text-[11px] font-semibold text-ink-3 hover:bg-bg-soft"
          >
            취소
          </button>
        </div>
      )}
    </li>
  )
}
