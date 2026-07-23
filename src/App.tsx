import type { ReactElement } from 'react'
import { useAppState, type TabId } from './app/AppState'
import { Banner, Button, Card, Icon } from './app/ui'
import { SummaryTab } from './app/tabs/SummaryTab'
import { CoursesTab } from './app/tabs/CoursesTab'
import { RequirementsTab } from './app/tabs/RequirementsTab'
import { SettingsTab } from './app/tabs/SettingsTab'
import { Onboarding } from './app/onboarding/Onboarding'

interface TabDef {
  id: TabId
  label: string
  icon: string
  subtitle: string
}

const TABS: TabDef[] = [
  { id: 'summary', label: '요약', icon: 'donut_large', subtitle: '전체 진행률과 남은 것' },
  { id: 'courses', label: '과목', icon: 'library_books', subtitle: '학기별 수강 목록' },
  { id: 'requirements', label: '요건', icon: 'checklist', subtitle: '영역별 진행 · 비교과 체크리스트' },
  { id: 'settings', label: '설정', icon: 'settings', subtitle: '백업 · 요건 세트 · 초기화' },
]

const TRACK_LABEL: Record<string, string> = {
  advanced: '심화과정',
  general: '일반과정',
  accredited: '공학인증',
}

const PANELS: Record<TabId, () => ReactElement | null> = {
  summary: SummaryTab,
  courses: CoursesTab,
  requirements: RequirementsTab,
  settings: SettingsTab,
}

export function App() {
  const {
    activeTab,
    setActiveTab,
    state,
    reqSet,
    hasData,
    persistent,
    storageReason,
    saveOk,
    exportPersonalBackup,
  } = useAppState()

  // 프로필이 없으면(첫 실행·초기화 후) 온보딩 마법사. 셸(사이드바·탭)은 숨긴다.
  if (state.profile == null) return <Onboarding />

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0]!
  const Panel = PANELS[activeTab]
  const { profile } = state
  // 프로필은 있으나 요건 세트를 못 찾는 손상 상태 — 설정(복원·초기화)은 계속 열어 둔다.
  const broken = !hasData && activeTab !== 'settings'

  const setSummary =
    profile != null ? `${String(profile.admissionYear).slice(2)}학번 · ${TRACK_LABEL[profile.trackType] ?? profile.trackType}` : ''

  return (
    <div className="min-h-screen lg:flex">
      {/* ── PC 사이드바 ── */}
      <aside className="hidden shrink-0 flex-col bg-navy px-4 py-6 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[236px]">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-chip bg-white/15">
            <Icon name="school" className="text-[19px]" />
          </span>
          <span className="leading-tight">
            <span className="block text-[13.5px] font-bold">졸업요건 트래커</span>
            <span className="block text-[10.5px] text-white/60">AJOU · beta</span>
          </span>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="주 메뉴">
          {TABS.map((t) => {
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-block px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                  active ? 'bg-white font-bold text-navy' : 'font-medium text-white/70 hover:bg-white/10'
                }`}
              >
                <Icon name={t.icon} fill={active} className="text-[20px]" />
                {t.label}
              </button>
            )
          })}
        </nav>

        {reqSet && (
          <div className="mt-auto rounded-block bg-white/[0.08] p-3.5">
            <div className="text-[11px] text-white/55">현재 요건 세트</div>
            <div className="text-[12.5px] font-bold leading-snug">{reqSet.name}</div>
            {setSummary && <div className="mt-0.5 text-[11px] text-white/55">{setSummary}</div>}
          </div>
        )}
      </aside>

      {/* ── 메인 ── */}
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-4xl px-5 pb-28 pt-7 lg:px-8 lg:pb-12 lg:pt-9">
          {/* 저장소 경고 · 저장 실패 배너 */}
          {(!persistent || !saveOk) && (
            <div className="mb-4 flex flex-col gap-2">
              {!persistent && (
                <Banner tone="warning" role="status">
                  {storageReason ?? '이 브라우저에서는 데이터를 저장할 수 없어요.'}
                </Banner>
              )}
              {!saveOk && (
                <Banner
                  tone="warning"
                  role="alert"
                  action={
                    <Button variant="secondary" icon="ios_share" onClick={exportPersonalBackup} className="!py-1.5 !text-[12px]">
                      백업 받기
                    </Button>
                  }
                >
                  방금 변경을 저장하지 못했어요. 데이터가 이 세션에서만 유지될 수 있으니 백업을 받아두세요.
                </Banner>
              )}
            </div>
          )}

          <header className="mb-5">
            <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{current.label}</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">{current.subtitle}</p>
            {reqSet && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-chip bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-ink-3 shadow-card lg:hidden">
                <Icon name="school" className="text-[14px] text-navy" />
                {reqSet.name}
                {setSummary && ` · ${setSummary}`}
              </div>
            )}
          </header>

          {broken ? <RecoveryCard /> : <Panel />}
        </main>
      </div>

      {/* ── 모바일 하단 독 ── */}
      <nav
        className="fixed inset-x-4 bottom-4 z-20 flex h-16 items-center justify-around rounded-card border border-line bg-surface px-1.5 shadow-card lg:hidden"
        aria-label="탭 이동"
      >
        {TABS.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1 ${active ? 'text-navy' : 'text-muted-2'}`}
            >
              <Icon name={t.icon} fill={active} className="text-[23px]" />
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/** 프로필은 있으나 요건 세트를 못 찾는 손상 상태 — 설정에서 복원·초기화로 안내. */
function RecoveryCard() {
  const { setActiveTab } = useAppState()
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
        <Icon name="help" className="text-[32px] text-orange" />
      </span>
      <div className="text-[16px] font-bold text-ink">요건 세트를 찾을 수 없어요</div>
      <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
        저장된 프로필이 가리키는 요건 세트가 없어요. 백업을 불러오거나 초기화한 뒤 다시 등록해 주세요.
      </p>
      <div className="mt-5">
        <Button variant="primary" icon="settings" onClick={() => setActiveTab('settings')}>
          설정으로 가기
        </Button>
      </div>
    </Card>
  )
}
