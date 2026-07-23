import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { Icon } from '../ui'

// ────────────────────────────────────────────────────────────
// 온보딩 마법사 전용 폼 프리미티브. 토큰(rounded-block·border-line·bg-surface)만 사용.
// 포커스는 blue 링으로 통일, 상태색은 아이콘·텍스트와 늘 병기(색맹 대응).
// ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}

/** 컨트롤 프리미티브만 자동 배선(id/aria-describedby) 대상으로 삼는다. */
function isWiredControl(type: unknown): boolean {
  return type === TextField || type === NumberField || type === SelectField
}

/**
 * 라벨 + 힌트 + 컨트롤 래퍼.
 * 자식이 우리 컨트롤(TextField/NumberField/SelectField)이면 id를 자동 생성해 label htmlFor와
 * 컨트롤 id, hint의 aria-describedby를 연결한다(호출부가 일일이 id를 넘기지 않아도 접근성 확보).
 * 그 외 자식(그룹 등)은 라벨을 span으로 렌더해 고아 label을 만들지 않는다.
 */
export function Field({ label, hint, htmlFor, children }: FieldProps) {
  const autoId = useId()
  const hintId = hint ? `${autoId}-hint` : undefined
  let control: ReactNode = children
  let forId = htmlFor
  if (isValidElement(children) && isWiredControl(children.type)) {
    const el = children as ReactElement<{ id?: string; describedBy?: string }>
    const id = el.props.id ?? autoId
    forId = htmlFor ?? id
    control = cloneElement(el, {
      id,
      describedBy: el.props.describedBy ?? hintId,
    })
  }
  return (
    <div className="flex flex-col gap-1.5">
      {forId ? (
        <label htmlFor={forId} className="text-[12px] font-bold text-ink-2">
          {label}
        </label>
      ) : (
        <span className="text-[12px] font-bold text-ink-2">{label}</span>
      )}
      {control}
      {hint && (
        <p id={hintId} className="text-[11.5px] leading-relaxed text-ink-3">
          {hint}
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-block border border-line bg-surface px-3.5 py-3 text-[14px] font-medium text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed disabled:bg-bg-soft disabled:text-muted'

interface TextFieldProps {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  inputMode?: 'text' | 'numeric'
  ariaLabel?: string
  describedBy?: string
}

export function TextField({ id, value, onChange, placeholder, disabled, inputMode, ariaLabel, describedBy }: TextFieldProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      inputMode={inputMode}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      className={CONTROL}
    />
  )
}

interface NumberFieldProps {
  id?: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  ariaLabel?: string
  describedBy?: string
}

/** 숫자 입력 — 빈 값은 null. suffix로 단위를 안쪽에 표시. */
export function NumberField({ id, value, onChange, placeholder, min, max, step, suffix, ariaLabel, describedBy }: NumberFieldProps) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onChange={(e) => {
          const t = e.target.value
          onChange(t === '' ? null : Number(t))
        }}
        className={`${CONTROL} ${suffix ? 'pr-10' : ''}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[12.5px] font-semibold text-muted-2">
          {suffix}
        </span>
      )}
    </div>
  )
}

interface SelectFieldProps {
  id?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  disabled?: boolean
  ariaLabel?: string
  describedBy?: string
}

/** 네이티브 select(자체 화살표). optgroup 지원. */
export function SelectField({ id, value, onChange, children, disabled, ariaLabel, describedBy }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} cursor-pointer appearance-none pr-10`}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute inset-y-0 right-3 my-auto h-5 text-[20px] text-muted-2"
      />
    </div>
  )
}

interface SegmentedProps<T extends string> {
  legend: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
}

/** 단일 선택 세그먼트 컨트롤(과정 구분 등). radiogroup/radio로 그룹 접근성. */
export function Segmented<T extends string>({ legend, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={legend} className="flex gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-block px-3 py-2.5 text-[13px] font-bold transition-colors ${
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
  )
}

interface OptionCardProps {
  selected: boolean
  onClick: () => void
  title: string
  desc?: ReactNode
  badge?: string
  disabled?: boolean
  icon?: string
}

/** 선택형 큰 카드(요건 세트·추가전공 유형). 라디오처럼 동작. */
export function OptionCard({ selected, onClick, title, desc, badge, disabled, icon }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative w-full rounded-block border-2 p-4 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-line-2 bg-bg-soft opacity-70'
          : selected
            ? 'border-navy bg-surface'
            : 'border-line bg-surface hover:border-line hover:bg-bg-soft'
      }`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip ${selected ? 'bg-navy text-white' : 'bg-bg-soft text-ink-3'}`}>
            <Icon name={icon} className="text-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold text-ink">{title}</span>
            {badge && (
              <span className="rounded-chip bg-blue/10 px-1.5 py-0.5 text-[10.5px] font-bold text-blue">
                {badge}
              </span>
            )}
          </div>
          {desc && <div className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{desc}</div>}
        </div>
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? 'border-navy bg-navy' : 'border-line'
          }`}
        >
          {selected && <Icon name="check" className="text-[13px] text-white" />}
        </span>
      </div>
    </button>
  )
}

interface CheckRowProps {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  desc?: string
}

/** 토글 체크 행(예외 사항·편입생 여부). */
export function CheckRow({ checked, onChange, title, desc }: CheckRowProps) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-block border p-3.5 transition-colors ${
        checked ? 'border-navy/30 bg-blue/[0.04]' : 'border-line bg-surface hover:bg-bg-soft'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 ${
          checked ? 'border-navy bg-navy' : 'border-line'
        }`}
      >
        {checked && <Icon name="check" className="text-[13px] text-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink-2">{title}</span>
        {desc && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-3">{desc}</span>}
      </span>
    </label>
  )
}

/** 과정 구분 등 선택 아래에 붙는 설명 노트(Q4: 선택지 설명 병기). */
export function SegmentedControlNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex items-start gap-2 rounded-block bg-bg-soft px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
      <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
      <p className="flex-1">{children}</p>
    </div>
  )
}

/** 각 단계 머리말(아이콘 + 제목 + 설명). */
export function StepIntro({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div>
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-block bg-navy text-white">
        <Icon name={icon} className="text-[24px]" />
      </span>
      <h2 className="text-[20px] font-extrabold leading-snug tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{desc}</p>
    </div>
  )
}

/** 미확인 항목 강조 인라인 배지(요건 확인 단계). */
export function UnverifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-chip bg-orange/10 px-1.5 py-0.5 text-[10.5px] font-bold text-orange">
      <Icon name="help" className="text-[12px]" />
      확인 필요
    </span>
  )
}
