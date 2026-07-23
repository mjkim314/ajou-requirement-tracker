import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearStoredData } from '../storage/adapter'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * 렌더 중 예외(예: 손상된 데이터로 evaluate 실패)로 앱이 백지가 되는 걸 막는다.
 * 저장 데이터를 비우고 복구할 수 있는 화면을 보여준다 — localStorage 접근은 adapter 계층 경유.
 * 스타일은 이 파일에 자족적으로 둔다(복구 화면은 다른 컴포넌트에 의존하지 않게).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info)
  }

  private readonly handleReset = (): void => {
    try {
      clearStoredData()
    } finally {
      window.location.reload()
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center p-6" role="alert">
        <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center shadow-card">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-soft">
            <span className="ms text-[30px] text-orange" aria-hidden="true">
              error
            </span>
          </span>
          <div className="text-[15px] font-bold text-ink">문제가 생겨 화면을 표시하지 못했어요</div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            저장된 데이터가 손상됐을 수 있어요. 데이터를 비우고 다시 시작하면 복구됩니다. 백업 파일이 있으면
            다시 불러올 수 있어요.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-block bg-navy px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy/90"
          >
            <span className="ms text-[17px]" aria-hidden="true">
              restart_alt
            </span>
            데이터 비우고 새로고침
          </button>
        </div>
      </div>
    )
  }
}
