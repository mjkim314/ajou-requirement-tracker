import { useMemo, useState } from 'react'
import { useAppState } from '../AppState'
import { Banner, Button, Card, Icon } from '../ui'
import {
  DEFAULT_GRADE_POINTS,
  type BucketResult,
  type GradePointTable,
  type Verdict,
} from '../../engine/index'

// 상태 색은 단독으로 쓰지 않는다 — 아이콘 + 텍스트를 항상 병기(색맹 대응).
const VERDICT_STYLE: Record<Verdict, { icon: string; chip: string; fg: string }> = {
  graduatable: { icon: 'verified', chip: 'bg-green/10', fg: 'text-green' },
  graduatable_after_current: { icon: 'schedule', chip: 'bg-blue/10', fg: 'text-blue' },
  not_graduatable: { icon: 'trending_up', chip: 'bg-orange/10', fg: 'text-orange' },
}

/**
 * 요약 탭 — 진행 상황 대시보드(도넛·평점·학기 배분·영역별 진행률·부족 항목).
 * 판정은 참고용 고지와 함께 부드럽게 노출한다(단정 회피).
 */
export function SummaryTab() {
  const {
    state,
    result,
    input,
    requestAddCourse,
    setActiveTab,
    backupReminder,
    exportPersonalBackup,
    dismissBackupReminder,
  } = useAppState()
  if (!result || !input) return null

  // 과목이 하나도 없으면 시안의 빈 요약(첫 과목 추가 유도)을 보여준다.
  if (state.courses.length === 0) {
    return <EmptySummary onAdd={requestAddCourse} onRestore={() => setActiveTab('settings')} />
  }

  const { verdict, verdictLabel, credits, gpa, plan } = result
  const v = VERDICT_STYLE[verdict]
  const rate = credits.required > 0 ? Math.min(credits.earned / credits.required, 1) : 1

  // 평점 만점은 요건 세트의 등급표(없으면 엔진 기본값)에서 도출 — 숫자 하드코딩 금지.
  const numericPoints = (t: GradePointTable) =>
    Object.values(t).filter((n): n is number => typeof n === 'number')
  const scaleValues = numericPoints(input.requirementSet.gradePoints ?? DEFAULT_GRADE_POINTS)
  const scaleMax = Math.max(
    ...(scaleValues.length > 0 ? scaleValues : numericPoints(DEFAULT_GRADE_POINTS)),
  )

  return (
    <div className="flex flex-col gap-4">
      {/* 백업 리마인더 — 요약 탭 상단. 모달로 막지 않고 1줄 배너 + 버튼(닫기 7일 숨김). */}
      {backupReminder && (
        <Banner
          tone={backupReminder.emphasized ? 'emphasis' : 'info'}
          icon="backup"
          role="status"
          onDismiss={dismissBackupReminder}
          dismissLabel="이 배너 닫기"
          action={
            <Button
              variant="secondary"
              icon="ios_share"
              onClick={exportPersonalBackup}
              className="!py-1.5 !text-[12px]"
            >
              백업 받기
            </Button>
          }
        >
          {backupReminder.message}
        </Banner>
      )}

      {/* 판정 + 도넛 진행률 */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-bold ${v.chip} ${v.fg}`}
          >
            <Icon name={v.icon} className="text-[18px]" />
            {verdictLabel}
          </span>
          <span className="text-[13px] text-ink-3">
            졸업까지 <b className="text-ink">{credits.remaining}</b>학점
          </span>
        </div>

        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <Donut earned={credits.earned} required={credits.required} rate={rate} />
          <div className="w-full flex-1">
            <div className="text-[13px] font-semibold text-ink-2">총 이수학점</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="이수" value={credits.earned} tone="text-navy" />
              <Stat label="남은" value={credits.remaining} tone="text-blue" />
              <Stat label="수강중" value={credits.inProgress} tone="text-ink-2" />
            </div>
            <p className="mt-4 rounded-block bg-bg-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-3">
              전체 <b className="text-ink">{Math.round(rate * 100)}%</b> 진행 · 남은{' '}
              <b className="text-ink">{credits.remaining}학점</b>
              {credits.inProgress > 0 && <> · 이번 학기 {credits.inProgress}학점 수강 중</>}
            </p>
          </div>
        </div>
      </Card>

      {/* 평점 + 학기 배분 제안 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] text-muted">전체 평점</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[24px] font-extrabold tracking-tight text-ink">
                  {gpa.overall.toFixed(2)}
                </span>
                <span className="text-[12px] text-muted-2">/ {scaleMax.toFixed(1)}</span>
              </div>
              <div
                className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${
                  gpa.satisfied ? 'text-green' : 'text-orange'
                }`}
              >
                <Icon name={gpa.satisfied ? 'check_circle' : 'error'} className="text-[13px]" />
                졸업 최저 {gpa.minRequired.toFixed(1)} {gpa.satisfied ? '충족' : '미달'}
              </div>
            </div>
            <div className="border-l border-line pl-4">
              <div className="text-[12px] text-muted">전공 평점</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[24px] font-extrabold tracking-tight text-navy">
                  {gpa.major.toFixed(2)}
                </span>
                <span className="text-[12px] text-muted-2">/ {scaleMax.toFixed(1)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-2">전공 과목 평점</div>
            </div>
          </div>
        </Card>

        <PlanCard plan={plan} />
      </div>

      {/* 영역별 진행률 */}
      <AreaBars buckets={result.buckets} />

      {/* 참고용 고지 — 상시 노출. AA 대비 확보. */}
      <div className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
        <Icon name="info" className="mt-px text-[15px]" />
        <p>
          본 계산은 <b className="text-ink-2">참고용</b>입니다. 최종 졸업 여부는 포털·학과사무실에서
          확인하세요.
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 도넛
// ────────────────────────────────────────────────────────────

const DONUT_R = 76
const DONUT_C = 2 * Math.PI * DONUT_R

function Donut({ earned, required, rate }: { earned: number; required: number; rate: number }) {
  const dash = Math.max(0, Math.min(1, rate)) * DONUT_C
  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg
        viewBox="0 0 180 180"
        className="h-full w-full"
        role="img"
        aria-label={`총 이수 ${earned} / ${required} 학점`}
      >
        <circle cx="90" cy="90" r={DONUT_R} className="fill-none stroke-line-2" strokeWidth="17" />
        <circle
          cx="90"
          cy="90"
          r={DONUT_R}
          className="fill-none stroke-navy"
          strokeWidth="17"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${DONUT_C}`}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[34px] font-extrabold leading-none tracking-tight text-ink">
          {earned}
        </div>
        <div className="mt-1 text-[12.5px] text-muted">/ {required} 학점</div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 학기 배분 제안
// ────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: import('../../engine/index').EvaluationResult['plan'] }) {
  const done = plan.remainingCredits <= 0
  const hasTarget = plan.remainingSemesters > 0
  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy to-navy-2 p-6 text-white shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] text-white/70">
        <Icon name="tips_and_updates" className="text-[17px]" />
        학기 배분 제안
      </div>
      {done ? (
        <div className="text-[15px] font-semibold leading-relaxed">
          남은 학점이 없어요. 학점 요건을 모두 채웠습니다.
        </div>
      ) : hasTarget ? (
        <>
          <div className="text-[15px] font-semibold leading-relaxed">
            남은 <b className="text-navy-accent">{plan.remainingCredits}학점</b>을{' '}
            <b className="text-navy-accent">{plan.remainingSemesters}학기</b>로 나누면
            <br />
            학기당 약 <b className="text-navy-accent">{plan.perSemester}학점</b>씩.
          </div>
          <div className="mt-2 text-[11.5px] text-white/60">
            {plan.overloaded
              ? '권장 학기 학점을 넘어서요. 목표 학기를 늘리는 걸 고려해 보세요.'
              : '한 학기에 몰아 들으면 더 빨리 마칠 수도 있어요.'}
          </div>
        </>
      ) : (
        <div className="text-[14px] font-semibold leading-relaxed">
          남은 <b className="text-navy-accent">{plan.remainingCredits}학점</b>.
          <div className="mt-2 text-[11.5px] font-normal text-white/60">
            목표 졸업 학기를 설정하면 학기별 배분을 제안해 드려요.
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 영역별 진행률
// ────────────────────────────────────────────────────────────

function AreaBars({ buckets }: { buckets: BucketResult[] }) {
  const [showDone, setShowDone] = useState(false)
  const { unmet, met } = useMemo(() => {
    const unmet: BucketResult[] = []
    const met: BucketResult[] = []
    for (const b of buckets) (b.satisfied ? met : unmet).push(b)
    // 부족 영역은 진행률 낮은 순으로 위에.
    unmet.sort((a, b) => a.rate - b.rate)
    return { unmet, met }
  }, [buckets])

  const visible = showDone ? [...unmet, ...met] : unmet

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13.5px] font-bold text-ink">영역별 진행률</div>
        <div className="text-[11.5px] text-muted-2">필요 학점 대비 이수</div>
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-green">
          <Icon name="check_circle" className="text-[18px]" />
          모든 영역이 충족됐어요.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((b) => (
            <BucketBar key={b.id} bucket={b} />
          ))}
        </div>
      )}

      {met.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((s) => !s)}
          className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3 hover:text-ink-2"
        >
          <Icon name={showDone ? 'expand_less' : 'expand_more'} className="text-[16px]" />
          {showDone ? '충족한 영역 접기' : `충족한 영역 ${met.length}개 보기`}
        </button>
      )}
    </Card>
  )
}

function BucketBar({ bucket }: { bucket: BucketResult }) {
  const pct = Math.round(Math.min(bucket.rate, 1) * 100)
  // 색 단독 금지 → 라벨·수치·아이콘을 늘 병기. 충족=green / 저조(<50%)=orange / 그 외=navy.
  const barColor = bucket.satisfied ? 'bg-green' : bucket.rate < 0.5 ? 'bg-orange' : 'bg-navy'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1 font-semibold text-ink-2">
          {bucket.label}
          {bucket.satisfied && <Icon name="check" className="text-[14px] text-green" />}
        </span>
        <span className={bucket.satisfied ? 'font-semibold text-green' : 'text-muted'}>
          {bucket.earned} / {bucket.required}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-line-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${bucket.earned} / ${bucket.required}학점`}
        aria-label={`${bucket.label} 진행률`}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {bucket.notes.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{bucket.notes.join(' · ')}</p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// 빈 상태 · 통계 조각
// ────────────────────────────────────────────────────────────

function EmptySummary({ onAdd, onRestore }: { onAdd: () => void; onRestore: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue/10">
          <Icon name="library_add" className="text-[34px] text-blue" />
        </span>
        <div className="text-[15px] font-bold text-ink">아직 과목이 없어요</div>
        <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
          수강한 과목을 추가하면 진행률과 평점이 자동으로 계산됩니다.
        </p>
        <div className="mt-5">
          <Button variant="primary" icon="add" onClick={onAdd}>
            첫 과목 추가하기
          </Button>
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-blue/20 bg-blue/[0.04] p-4">
        <Icon name="upload_file" className="mt-0.5 text-[20px] text-blue" />
        <div className="flex-1">
          <div className="text-[12.5px] font-bold text-navy">이전 데이터가 있나요?</div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
            설정에서 백업 JSON 파일을 불러오면 그대로 복원됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 self-center rounded-chip px-2.5 py-1.5 text-[12px] font-bold text-blue hover:bg-blue/10"
        >
          설정으로
        </button>
      </Card>

      <div className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
        <Icon name="info" className="mt-px text-[15px]" />
        <p>
          본 계산은 <b className="text-ink-2">참고용</b>입니다. 최종 졸업 여부는 포털·학과사무실에서
          확인하세요.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-block bg-bg-soft px-3.5 py-3">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`text-[20px] font-extrabold ${tone}`}>{value}</span>
      </div>
    </div>
  )
}
