import { useRef, useState } from 'react'
import { useAppState } from '../AppState'
import { Banner, Button, Card, Icon, Modal } from '../ui'
import { ProfileStep } from './steps/ProfileStep'
import { ReqsetStep } from './steps/ReqsetStep'
import { AdditionalMajorStep } from './steps/AdditionalMajorStep'
import { ExceptionsStep } from './steps/ExceptionsStep'
import { ReviewStep } from './steps/ReviewStep'
import {
  TRACK_INFO,
  additionalStepValid,
  baseReqSet,
  buildCommit,
  emptyDraft,
  profileStepValid,
  reqsetStepValid,
  type OnboardingDraft,
  type TrackType,
} from './model'
import { requirementSetRegistry } from '../../data/index'
import type { RequirementSet } from '../../engine/index'
import {
  backupFilename,
  buildPersonalBackup,
  downloadJson,
  parsePersonalBackup,
  readFileText,
  serialize,
} from '../../storage/backup'
import type { PersonalBackup, PersonalPreview, PersistedState } from '../../storage/schema'

type Phase = 'welcome' | 'steps' | 'done'

interface StepDef {
  key: string
  label: string
  valid: (d: OnboardingDraft, reqSet: RequirementSet | null) => boolean
}

const STEPS: StepDef[] = [
  { key: 'profile', label: '내 정보', valid: profileStepValid },
  { key: 'reqset', label: '요건 세트', valid: reqsetStepValid },
  { key: 'additional', label: '추가 전공', valid: additionalStepValid },
  { key: 'exceptions', label: '예외/학기', valid: () => true },
  { key: 'review', label: '요건 확인', valid: () => true },
]

export function Onboarding() {
  const { state, applyPersonalBackup, loadDemo, completeOnboarding, persistent, storageReason } = useAppState()
  const [nowYear] = useState(() => new Date().getFullYear())
  const [phase, setPhase] = useState<Phase>('welcome')
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft)

  const patch = (p: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...p }))

  const step = STEPS[stepIndex]!
  const effectiveReqSet = baseReqSet(draft, requirementSetRegistry)
  const canNext = step.valid(draft, effectiveReqSet)

  function goNext() {
    if (!canNext) return
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1)
    else setPhase('done')
  }
  function goBack() {
    if (stepIndex > 0) setStepIndex((i) => i - 1)
    else setPhase('welcome')
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-[560px]">
        <BrandHeader />

        {!persistent && (
          <div className="mb-4">
            <Banner tone="warning" role="status">
              {storageReason ?? '이 브라우저에서는 데이터를 저장할 수 없어요. 입력해도 유지되지 않을 수 있어요.'}
            </Banner>
          </div>
        )}

        {phase === 'welcome' && (
          <Welcome
            onStart={() => {
              setStepIndex(0)
              setPhase('steps')
            }}
            onRestore={applyPersonalBackup}
            onDemo={loadDemo}
          />
        )}

        {phase === 'steps' && (
          <div className="flex flex-col gap-4">
            <StepIndicator current={stepIndex} />
            <Card className="p-5 sm:p-7">
              {step.key === 'profile' && <ProfileStep draft={draft} patch={patch} nowYear={nowYear} />}
              {step.key === 'reqset' && <ReqsetStep draft={draft} patch={patch} />}
              {step.key === 'additional' && <AdditionalMajorStep draft={draft} patch={patch} />}
              {step.key === 'exceptions' && <ExceptionsStep draft={draft} patch={patch} />}
              {step.key === 'review' && <ReviewStep draft={draft} patch={patch} />}
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" icon="arrow_back" onClick={goBack}>
                {stepIndex === 0 ? '처음으로' : '이전'}
              </Button>
              <Button variant="primary" onClick={goNext} disabled={!canNext} className="min-w-[128px]">
                {stepIndex < STEPS.length - 1 ? '다음' : '확인 완료'}
                <Icon name="arrow_forward" className="text-[17px]" />
              </Button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <Done
            draft={draft}
            liveState={state}
            onBack={() => setPhase('steps')}
            onComplete={completeOnboarding}
          />
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 브랜드 헤더
// ────────────────────────────────────────────────────────────

function BrandHeader() {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-block bg-navy text-white">
        <Icon name="school" className="text-[20px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[14px] font-extrabold text-ink">졸업요건 트래커</span>
        <span className="block text-[11px] text-muted">AJOU · 서버 없이 이 기기에만 저장</span>
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 스텝 인디케이터
// ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="온보딩 단계">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  done
                    ? 'bg-navy text-white'
                    : active
                      ? 'bg-navy text-white ring-4 ring-navy/15'
                      : 'bg-line-2 text-muted-2'
                }`}
              >
                {done ? <Icon name="check" className="text-[14px]" /> : i + 1}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className={`h-0.5 flex-1 rounded-full ${done ? 'bg-navy' : 'bg-line-2'}`} />
              )}
            </div>
            {/* 상태를 스크린리더에 항상 제공(시각 라벨은 sm+에서만 노출). */}
            <span className="sr-only" aria-current={active ? 'step' : undefined}>
              {`${i + 1}단계 ${s.label}: ${done ? '완료' : active ? '현재 단계' : '예정'}`}
            </span>
            <span
              aria-hidden="true"
              className={`hidden text-center text-[10px] font-semibold sm:block ${
                active ? 'text-navy' : done ? 'text-ink-3' : 'text-muted-2'
              }`}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ────────────────────────────────────────────────────────────
// 시작 화면 (복원 진입점 포함)
// ────────────────────────────────────────────────────────────

function Welcome({
  onStart,
  onRestore,
  onDemo,
}: {
  onStart: () => void
  onRestore: (b: PersonalBackup) => void
  onDemo: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ backup: PersonalBackup; preview: PersonalPreview } | null>(null)

  async function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const parsed = parsePersonalBackup(await readFileText(file))
      if (!parsed.ok) {
        setError(parsed.message)
        return
      }
      setPreview({ backup: parsed.value.backup, preview: parsed.value.preview })
    } catch {
      setError('파일을 읽지 못했어요. 다시 시도해 주세요.')
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-[22px] font-extrabold leading-snug tracking-tight text-ink">
        졸업까지 뭐가 남았는지
        <br />
        바로 볼 수 있게 시작해요
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        학번·학과·과정과 요건을 등록하면, 들은 과목을 넣을 때마다 남은 것을 계산해 줘요. 계정도 서버도
        없어요.
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        <Button variant="primary" icon="arrow_forward" block onClick={onStart} className="!py-3.5 !text-[14px]">
          새로 시작하기
        </Button>
        <Button variant="secondary" icon="download" block onClick={() => inputRef.current?.click()} className="!py-3.5 !text-[14px]">
          백업 파일 불러오기
        </Button>
        <button
          type="button"
          onClick={onDemo}
          className="mt-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-3 hover:text-ink-2"
        >
          <Icon name="science" className="text-[16px]" />
          데모 데이터로 먼저 둘러보기
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-block bg-orange/10 px-3.5 py-2.5 text-[12px] text-orange">
          <Icon name="error" className="mt-px shrink-0 text-[16px]" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Icon name="lock" className="mt-px text-[13px]" />
        기기를 바꿨다면 백업 파일로 그대로 복원할 수 있어요.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <Modal
        open={preview != null}
        onClose={() => setPreview(null)}
        title="백업 불러오기"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              icon="download"
              onClick={() => {
                if (preview) onRestore(preview.backup)
                setPreview(null)
              }}
            >
              이 백업으로 시작
            </Button>
          </>
        }
      >
        {preview && (
          <div className="rounded-block bg-bg-soft px-3.5 py-3 text-[12.5px]">
            <PreviewRow label="백업 일시" value={formatDateTime(preview.preview.exportedAt)} />
            <PreviewRow
              label="학번 · 학과"
              value={`${preview.preview.admissionYear ?? '—'}학번 · ${preview.preview.department ?? '—'}`}
            />
            <PreviewRow label="과목" value={`${preview.preview.courseCount}건`} />
          </div>
        )}
      </Modal>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────
// 완료 화면 (백업 권유 · 시작)
// ────────────────────────────────────────────────────────────

function Done({
  draft,
  liveState,
  onBack,
  onComplete,
}: {
  draft: OnboardingDraft
  liveState: PersistedState
  onBack: () => void
  onComplete: (commit: ReturnType<typeof buildCommit>, backedUpAt?: string) => void
}) {
  // 완료 시각·커밋을 마운트 시 한 번만 계산 → 백업 파일과 저장 프로필의 시각 메타가 일치한다.
  const [built] = useState(() => {
    const iso = new Date().toISOString()
    return { iso, commit: buildCommit(draft, requirementSetRegistry, iso) }
  })
  const [backedUp, setBackedUp] = useState(false)

  const trackLabel = draft.trackType ? TRACK_INFO[draft.trackType as TrackType].label : '—'

  function handleBackup() {
    // 완료 후의 상태를 그대로 백업한다. 온보딩 '다시 하기'로 재진입한 경우 남아있는 과목·비교과·기존
    // 커스텀 세트까지 포함해야 '과목 0건' 반쪽 파일이 되지 않는다(신규 사용자는 이 값이 비어 결과 동일).
    // customSets 병합은 completeOnboarding과 같은 규칙(같은 id는 온보딩 커밋으로 덮어씀).
    const byId = new Map(liveState.customSets.map((x) => [x.id, x]))
    for (const set of built.commit.customSets) byId.set(set.id, set)
    const backupState: PersistedState = {
      profile: built.commit.profile,
      courses: liveState.courses,
      noncurricular: liveState.noncurricular,
      customSets: [...byId.values()],
      settings: {
        ...liveState.settings,
        lastBackupAt: built.iso,
        courseCountAtLastBackup: liveState.courses.length,
      },
    }
    downloadJson(
      backupFilename('ajou-grad-backup', built.commit.profile.admissionYear, new Date(built.iso)),
      serialize(buildPersonalBackup(backupState, built.iso)),
    )
    setBackedUp(true)
  }

  function handleStart() {
    onComplete(built.commit, backedUp ? built.iso : undefined)
  }

  return (
    <Card className="p-6 sm:p-8">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green/10">
        <Icon name="celebration" className="text-[28px] text-green" />
      </span>
      <h1 className="text-[21px] font-extrabold tracking-tight text-ink">등록이 끝났어요</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        이제 요약 화면에서 남은 것을 볼 수 있어요. 과목은 시작한 뒤 <b className="text-ink-2">과목 탭</b>에서
        추가하면 진행률에 바로 반영돼요.
      </p>

      <div className="mt-5 rounded-block bg-bg-soft px-4 py-3.5">
        <SummaryRow label="학번 · 학과" value={`${draft.admissionYear ?? '—'}학번 · ${draft.department || '—'}`} />
        <SummaryRow label="과정" value={trackLabel} />
        <SummaryRow
          label="요건 세트"
          value={
            draft.reqset?.kind === 'preset'
              ? '기본 제공'
              : draft.reqset?.kind === 'shared'
                ? '공유 세트'
                : '빈 세트(직접 구성)'
          }
        />
        {draft.additionalMajors.length > 0 && (
          <SummaryRow label="추가 전공" value={`${draft.additionalMajors.length}개`} />
        )}
      </div>

      {/* 백업 권유 — 모달로 막지 않고 배너 + 버튼 (D4) */}
      <div className="mt-4 flex flex-col gap-2.5 rounded-block border border-line bg-surface p-4">
        <div className="flex items-start gap-2">
          <Icon name="cloud_download" className="mt-px shrink-0 text-[18px] text-blue" />
          <p className="flex-1 text-[12px] leading-relaxed text-ink-2">
            데이터는 이 브라우저에만 있어요. 지금 백업 파일을 받아두면 기기를 바꿔도 그대로 복원할 수 있어요.
          </p>
        </div>
        {backedUp ? (
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green">
            <Icon name="check_circle" className="text-[16px]" />
            백업 파일을 받았어요
          </div>
        ) : (
          <Button variant="secondary" icon="ios_share" onClick={handleBackup} className="self-start !py-2 !text-[12.5px]">
            백업 파일 받기
          </Button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" icon="arrow_back" onClick={onBack}>
          이전
        </Button>
        <Button variant="primary" icon="arrow_forward" onClick={handleStart} className="min-w-[128px]">
          시작하기
        </Button>
      </div>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────
// 보조
// ────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink-2">{value}</span>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink-2">{value}</span>
    </div>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
