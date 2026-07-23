import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ────────────────────────────────────────────────────────────
// 공용 UI 프리미티브. 카드 표면·라운드·그림자·상태색을 여기 한 곳에서 토큰으로 고정한다.
// ────────────────────────────────────────────────────────────

interface IconProps {
  name: string
  /** FILL 1 (채워진) 변형. 활성 탭 등에서 사용. */
  fill?: boolean
  className?: string
}

/** Material Symbols Rounded 아이콘. 라벨이 늘 함께 있으므로 장식 처리(aria-hidden). */
export function Icon({ name, fill = false, className = '' }: IconProps) {
  return (
    <span className={`ms${fill ? ' ms-fill' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}

interface CardProps {
  className?: string
  children: ReactNode
  /** 필요 시 접근성 role(예: 오류 카드에 "alert"). */
  role?: string
}

/** 흰 카드 표면 — 토큰(surface·line·rounded-card·shadow-card)만 사용. 패딩은 호출부가 정한다. */
export function Card({ className = '', children, role }: CardProps) {
  return (
    <section role={role} className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      {children}
    </section>
  )
}

interface TabPlaceholderProps {
  icon: string
  title: string
  desc: string
}

/** 아직 구현 전인 탭의 자리표시 카드. 시안 빈 상태 톤을 따른다. */
export function TabPlaceholder({ icon, title, desc }: TabPlaceholderProps) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-soft">
        <Icon name={icon} className="text-[34px] text-muted-2" />
      </span>
      <div className="text-[15px] font-bold text-ink">{title}</div>
      <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-3">{desc}</p>
      <span className="mt-4 rounded-chip bg-bg-soft px-3 py-1.5 text-[11.5px] font-semibold text-muted">
        다음 단계에서 준비 중
      </span>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────
// 버튼
// ────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-white hover:bg-navy/90',
  secondary: 'bg-surface border border-line text-ink-2 hover:bg-bg-soft',
  danger: 'bg-surface border border-orange/40 text-orange hover:bg-orange/10',
  ghost: 'text-ink-3 hover:bg-bg-soft',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: string
  block?: boolean
}

export function Button({
  variant = 'secondary',
  icon,
  block = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-block px-3.5 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        BUTTON_VARIANT[variant]
      } ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="text-[17px]" />}
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────
// 배너 (저장소 경고·저장 실패 등)
// ────────────────────────────────────────────────────────────

type BannerTone = 'warning' | 'info' | 'emphasis'

// wrap=배경+본문색, icon=리딩 아이콘색, dismiss=닫기(X) 버튼색. 본문·닫기는 AA 대비를 확보한다
// (info 본문은 옅은 파랑 배경 위에서 파랑 텍스트가 저대비라 네이비로 올림, 닫기는 톤별 고정색+포커스 링).
const BANNER_TONE: Record<BannerTone, { wrap: string; icon: string; iconName: string; dismiss: string }> = {
  warning: {
    wrap: 'bg-orange/10 text-orange',
    icon: 'text-orange',
    iconName: 'warning',
    dismiss: 'text-orange hover:bg-orange/15 focus-visible:ring-orange/50',
  },
  info: {
    wrap: 'bg-blue/10 text-navy',
    icon: 'text-blue',
    iconName: 'info',
    dismiss: 'text-navy/70 hover:bg-navy/10 hover:text-navy focus-visible:ring-navy/40',
  },
  // 학기말 1회 강조 — 색 단독이 아니라 아이콘+문구 병기, 겁주지 않게 네이비(경고 아님).
  emphasis: {
    wrap: 'bg-navy text-white',
    icon: 'text-white',
    iconName: 'backup',
    dismiss: 'text-white/80 hover:bg-white/15 hover:text-white focus-visible:ring-white/60',
  },
}

interface BannerProps {
  tone?: BannerTone
  /** 기본 아이콘 대신 지정. */
  icon?: string
  children: ReactNode
  action?: ReactNode
  /** 있으면 닫기(X) 버튼을 렌더. */
  onDismiss?: () => void
  /** 닫기 버튼 aria-label(기본 "닫기"). */
  dismissLabel?: string
  /** live region role(동적으로 나타나는 배너는 "alert"/"status"로 스크린리더에 알림). */
  role?: string
}

export function Banner({ tone = 'info', icon, children, action, onDismiss, dismissLabel = '닫기', role }: BannerProps) {
  const t = BANNER_TONE[tone]
  return (
    <div
      role={role}
      className={`flex items-center gap-2 rounded-block px-3.5 py-2.5 text-[12.5px] font-medium ${t.wrap}`}
    >
      <Icon name={icon ?? t.iconName} className={`shrink-0 text-[17px] ${t.icon}`} />
      <span className="flex-1">{children}</span>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={`shrink-0 rounded-chip p-0.5 outline-none transition-colors focus-visible:ring-2 ${t.dismiss}`}
        >
          <Icon name="close" className="text-[16px]" />
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 모달
// ────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** 'md'(기본, max-w-md) · 'lg'(편집기 등, max-w-2xl). 본문은 길면 내부 스크롤. */
  size?: 'md' | 'lg'
}

const MODAL_WIDTH: Record<'md' | 'lg', string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  // onClose가 매 렌더 새 함수여도 effect가 재실행돼 포커스를 흔들지 않도록 ref로 참조.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // 열릴 때: 직전 포커스를 저장하고 다이얼로그로 포커스를 옮긴다.
    prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null
    dialogRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      // 포커스 트랩: 다이얼로그 안에서만 Tab 순환.
      const dialog = dialogRef.current
      if (!dialog) return
      const items = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // 닫힐 때: 열기 직전의 포커스를 복원한다.
      prevFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/35 p-0 sm:items-center sm:p-4"
      onClick={() => onClose()}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-card bg-surface shadow-card outline-none sm:max-h-[88vh] sm:rounded-card ${MODAL_WIDTH[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="text-[16px] font-extrabold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 rounded-chip p-1 text-muted-2 hover:bg-bg-soft hover:text-ink-2"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {/* 본문은 길어지면 내부 스크롤(헤더·푸터는 고정). */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1 text-[13px] leading-relaxed text-ink-2">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-2 px-5 pb-5 pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
