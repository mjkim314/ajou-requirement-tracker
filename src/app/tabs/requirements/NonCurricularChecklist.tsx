import type {
  NonCurricularResult,
  NonCurricularState,
  Requirement,
  RequirementAlternative,
} from '../../../engine/index'
import { removeNcAlternative, setNcAlternative, setNcEntry } from '../../reqset-editor'
import { Card, Icon } from '../../ui'
import { NumberField, SelectField, TextField } from '../../onboarding/fields'

interface Props {
  requirements: Requirement[]
  results: NonCurricularResult[]
  state: NonCurricularState
  onChange: (next: NonCurricularState) => void
}

type Progress = 'done' | 'progress' | 'todo' | 'inactive'

const PROGRESS_STYLE: Record<Progress, { icon: string; label: string; cls: string }> = {
  done: { icon: 'check_circle', label: '완료', cls: 'text-green' },
  progress: { icon: 'schedule', label: '진행중', cls: 'text-blue' },
  todo: { icon: 'radio_button_unchecked', label: '미완료', cls: 'text-muted-2' },
  inactive: { icon: 'remove', label: '해당 없음', cls: 'text-muted-2' },
}

type Entry = NonCurricularState[string]

function hasAnyInput(entry: Entry): boolean {
  if (entry.done) return true
  if (typeof entry.score === 'number') return true
  if (typeof entry.count === 'number' && entry.count > 0) return true
  if (entry.level) return true
  if (entry.alternatives) {
    return Object.values(entry.alternatives).some(
      (a) => a.done || typeof a.score === 'number' || !!a.level,
    )
  }
  return false
}

function progressOf(active: boolean, satisfied: boolean, entry: Entry): Progress {
  if (!active) return 'inactive'
  if (satisfied) return 'done'
  return hasAnyInput(entry) ? 'progress' : 'todo'
}

/**
 * 비교과 요건 체크리스트(요건 탭 읽기 화면). 요건 유형별로 정확히 입력받아
 * 엔진(checkNonCurricular)과 동일한 기준으로 판정한다 — 진행 상태는 evaluate() 결과를 그대로 쓴다.
 * 과목으로 자동 판정되는 항목(courseGroupPick)은 읽기 전용으로 상태만 보여준다.
 */
export function NonCurricularChecklist({ requirements, results, state, onChange }: Props) {
  const resultById = new Map(results.map((r) => [r.id, r]))

  return (
    <Card className="p-5">
      <div className="mb-1 text-[13.5px] font-bold text-ink">비교과 요건 체크리스트</div>
      <p className="mb-4 text-[11.5px] leading-relaxed text-muted-2">
        인증·시험 결과를 입력하면 요약 판정에 바로 반영돼요.
      </p>

      {requirements.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">이 세트에는 비교과 요건이 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-2">
          {requirements.map((req) => {
            const res = resultById.get(req.id)
            const active = res?.active ?? true
            const satisfied = res?.satisfied ?? false
            const entry = state[req.id] ?? {}
            const prog = progressOf(active, satisfied, entry)
            const st = PROGRESS_STYLE[prog]
            return (
              <li key={req.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Icon name={st.icon} className={`text-[18px] ${st.cls}`} />
                  <span className="flex-1 text-[13px] font-semibold text-ink-2">{req.label}</span>
                  <span className={`text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                </div>

                {active ? (
                  <div className="mt-2.5 pl-6">
                    <RequirementInput
                      req={req}
                      entry={entry}
                      onEntry={(patch) => onChange(setNcEntry(state, req.id, patch))}
                      onAlt={(altId, patch) => onChange(setNcAlternative(state, req.id, altId, patch))}
                      onRemoveAlt={(altId) => onChange(removeNcAlternative(state, req.id, altId))}
                    />
                  </div>
                ) : (
                  <p className="mt-1 pl-6 text-[11.5px] text-muted-2">
                    이 과정에는 해당되지 않는 항목이에요.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ────────────────────────────────────────────────────────────
// 유형별 입력
// ────────────────────────────────────────────────────────────

type AltPatch = { done?: boolean; score?: number; level?: string }

interface InputProps {
  req: Requirement
  entry: Entry
  onEntry: (patch: Partial<Entry>) => void
  onAlt: (altId: string, patch: AltPatch) => void
  onRemoveAlt: (altId: string) => void
}

function RequirementInput({ req, entry, onEntry, onAlt, onRemoveAlt }: InputProps) {
  switch (req.type) {
    case 'check':
      return (
        <ToggleRow
          checked={entry.done === true}
          onChange={(v) => onEntry({ done: v })}
          label="완료했어요"
        />
      )

    case 'count':
      return (
        <SmallNumber
          value={entry.count ?? null}
          onChange={(v) => onEntry({ count: v ?? undefined })}
          suffix={req.unit ?? '회'}
          hint={req.min != null ? `${req.min}${req.unit ?? '회'} 이상 필요` : undefined}
        />
      )

    case 'score':
      return (
        <SmallNumber
          value={entry.score ?? null}
          onChange={(v) => onEntry({ score: v ?? undefined })}
          suffix={req.unit ?? '점'}
          hint={req.min != null ? `${req.min}${req.unit ?? '점'} 이상 필요` : undefined}
        />
      )

    case 'level':
      return (
        <LevelInput
          scale={req.scale}
          value={entry.level ?? ''}
          onChange={(v) => onEntry({ level: v || undefined })}
          hint={req.min != null ? `${req.min} 이상 필요` : undefined}
        />
      )

    case 'alternatives':
      return (
        <AlternativesInput req={req} entry={entry} onAlt={onAlt} onRemoveAlt={onRemoveAlt} />
      )

    case 'courseGroupPick':
      return (
        <div className="rounded-block bg-bg-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
          <div className="flex items-start gap-1.5">
            <Icon name="auto_awesome" className="mt-px shrink-0 text-[14px] text-blue" />
            <p>
              과목군에서 {req.pick ?? 1}개 이수하면 충족돼요. <b className="text-ink-2">과목 탭</b>에
              해당 과목을 입력하면 자동으로 반영됩니다.
            </p>
          </div>
          {(req.groups ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(req.groups ?? []).map((g) => (
                <span key={g.id} className="rounded-chip bg-surface px-1.5 py-0.5 text-[10.5px] font-medium text-ink-3">
                  {g.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )

    default:
      return null
  }
}

/**
 * alternatives(택N) 요건 입력. 모든 시험 칸을 늘어놓지 않고, 사용자가 **가진 시험을 골라**
 * 성적을 입력하게 한다. 여러 어학을 딴 경우 아래 선택으로 계속 **추가**할 수 있고, 각 줄은
 * 지울 수 있다. 상태는 entry.alternatives[altId]에 그대로 저장돼 엔진 판정(pick개 충족)과 일치한다.
 */
function AlternativesInput({
  req,
  entry,
  onAlt,
  onRemoveAlt,
}: {
  req: Requirement
  entry: Entry
  onAlt: (altId: string, patch: AltPatch) => void
  onRemoveAlt: (altId: string) => void
}) {
  const alternatives = req.alternatives ?? []
  const altById = new Map(alternatives.map((a) => [a.id, a]))
  // 고른 시험 = 상태에 존재하는 altId(요건 정의에 남아 있는 것만).
  const chosen = Object.keys(entry.alternatives ?? {})
    .map((id) => altById.get(id))
    .filter((a): a is RequirementAlternative => a != null)
  const chosenIds = new Set(chosen.map((a) => a.id))
  const unused = alternatives.filter((a) => !chosenIds.has(a.id))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-2">
        {req.pick ?? 1}개만 충족하면 돼요. 가진 시험을 골라 성적을 입력하세요.
      </p>

      {chosen.map((alt) => (
        <ChosenAltRow
          key={alt.id}
          alt={alt}
          st={entry.alternatives?.[alt.id] ?? {}}
          onChange={(patch) => onAlt(alt.id, patch)}
          onRemove={() => onRemoveAlt(alt.id)}
        />
      ))}

      {unused.length > 0 ? (
        <AddAltSelect
          options={unused}
          hasChosen={chosen.length > 0}
          onPick={(altId) => onAlt(altId, {})}
        />
      ) : (
        <p className="text-[10.5px] text-muted-2">추가할 수 있는 시험을 모두 넣었어요.</p>
      )}
    </div>
  )
}

/** 사용자가 고른 시험 한 줄: 라벨 + (점수/등급/보유) 입력 + 기준 + 삭제. */
function ChosenAltRow({
  alt,
  st,
  onChange,
  onRemove,
}: {
  alt: RequirementAlternative
  st: AltPatch
  onChange: (patch: AltPatch) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-block bg-bg-soft px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-ink-2" title={alt.label}>
          {alt.label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${alt.label} 제거`}
          className="-mr-1 shrink-0 rounded-chip p-1 text-muted-2 transition-colors hover:bg-orange/10 hover:text-orange"
        >
          <Icon name="close" className="text-[16px]" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {alt.type === 'check' ? (
            <ToggleRow checked={st.done === true} onChange={(v) => onChange({ done: v })} label="보유" />
          ) : alt.type === 'score' ? (
            <NumberField
              value={st.score ?? null}
              onChange={(v) => onChange({ score: v ?? undefined })}
              min={0}
              suffix={alt.unit ?? '점'}
              ariaLabel={`${alt.label} 점수`}
            />
          ) : (
            <SelectField
              value={st.level ?? ''}
              onChange={(v) => onChange({ level: v || undefined })}
              ariaLabel={`${alt.label} 등급`}
            >
              <option value="">선택…</option>
              {(alt.scale ?? []).map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        {alt.min != null && (
          <span className="shrink-0 text-[10.5px] text-muted-2">
            {alt.min}
            {alt.unit ?? ''}+
          </span>
        )}
      </div>
    </div>
  )
}

/** 아직 고르지 않은 시험을 추가하는 선택. 고르면 그 시험이 위 목록에 한 줄로 붙는다. */
function AddAltSelect({
  options,
  hasChosen,
  onPick,
}: {
  options: RequirementAlternative[]
  hasChosen: boolean
  onPick: (altId: string) => void
}) {
  return (
    <div className="relative">
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value)
        }}
        aria-label="시험 추가"
        className="w-full cursor-pointer appearance-none rounded-block border border-dashed border-line bg-surface py-2 pl-3 pr-9 text-[12px] font-semibold text-ink-3 outline-none transition-colors hover:bg-bg-soft focus:border-blue focus:ring-2 focus:ring-blue/20"
      >
        <option value="">{hasChosen ? '다른 시험 추가…' : '가진 시험 선택…'}</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <Icon
        name="add"
        className="pointer-events-none absolute inset-y-0 right-3 my-auto h-5 text-[16px] text-muted-2"
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 작은 입력 프리미티브
// ────────────────────────────────────────────────────────────

function SmallNumber({
  value,
  onChange,
  suffix,
  hint,
}: {
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32">
        <NumberField value={value} onChange={onChange} min={0} suffix={suffix} ariaLabel="입력값" />
      </div>
      {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
    </div>
  )
}

function LevelInput({
  scale,
  value,
  onChange,
  hint,
}: {
  scale?: string[]
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32">
        {scale && scale.length > 0 ? (
          <SelectField value={value} onChange={onChange} ariaLabel="등급">
            <option value="">선택…</option>
            {scale.map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </SelectField>
        ) : (
          <TextField value={value} onChange={onChange} placeholder="등급" ariaLabel="등급" />
        )}
      </div>
      {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
    </div>
  )
}

function ToggleRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-block border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        checked
          ? 'border-green/40 bg-green/10 text-green'
          : 'border-line bg-surface text-ink-3 hover:bg-bg-soft'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 items-center justify-center rounded-[5px] border-2 ${
          checked ? 'border-green bg-green' : 'border-line'
        }`}
      >
        {checked && <Icon name="check" className="text-[11px] text-white" />}
      </span>
      {label}
    </button>
  )
}
