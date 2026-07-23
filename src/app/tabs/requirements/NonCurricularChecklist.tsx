import type {
  NonCurricularResult,
  NonCurricularState,
  Requirement,
  RequirementAlternative,
} from '../../../engine/index'
import { setNcAlternative, setNcEntry } from '../../reqset-editor'
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

interface InputProps {
  req: Requirement
  entry: Entry
  onEntry: (patch: Partial<Entry>) => void
  onAlt: (altId: string, patch: { done?: boolean; score?: number; level?: string }) => void
}

function RequirementInput({ req, entry, onEntry, onAlt }: InputProps) {
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
        <div className="flex flex-col gap-2.5">
          <p className="text-[11px] text-muted-2">
            아래 중 {req.pick ?? 1}개만 충족하면 돼요. 가진 것만 입력하세요.
          </p>
          {(req.alternatives ?? []).map((alt) => (
            <AlternativeInput
              key={alt.id}
              alt={alt}
              st={entry.alternatives?.[alt.id] ?? {}}
              onChange={(patch) => onAlt(alt.id, patch)}
            />
          ))}
        </div>
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

function AlternativeInput({
  alt,
  st,
  onChange,
}: {
  alt: RequirementAlternative
  st: { done?: boolean; score?: number; level?: string }
  onChange: (patch: { done?: boolean; score?: number; level?: string }) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-28 shrink-0 truncate text-[12px] font-medium text-ink-2" title={alt.label}>
        {alt.label}
      </span>
      <div className="flex-1">
        {alt.type === 'check' ? (
          <ToggleRow checked={st.done === true} onChange={(v) => onChange({ done: v })} label="보유" />
        ) : alt.type === 'score' ? (
          <SmallNumber
            value={st.score ?? null}
            onChange={(v) => onChange({ score: v ?? undefined })}
            suffix={alt.unit ?? '점'}
          />
        ) : (
          <LevelInput
            scale={alt.scale}
            value={st.level ?? ''}
            onChange={(v) => onChange({ level: v || undefined })}
          />
        )}
      </div>
      {alt.min != null && (
        <span className="shrink-0 text-[10.5px] text-muted-2">
          {alt.min}
          {alt.unit ?? ''}+
        </span>
      )}
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
