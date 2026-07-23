import { useRef, useState, type ReactNode } from 'react'
import { useAppState } from '../AppState'
import { Button, Card, Icon, Modal } from '../ui'
import { parsePersonalBackup, parseReqsetShare, readFileText } from '../../storage/backup'
import { backupStatus } from '../backup-reminder'
import type {
  PersonalBackup,
  PersonalPreview,
  ReqsetShare,
  SharePreview,
} from '../../storage/schema'

/** 초기화를 진행하려면 입력해야 하는 확인 문구. */
const RESET_CONFIRM_WORD = '초기화'

const TRACK_LABEL: Record<string, string> = {
  advanced: '심화과정',
  general: '일반과정',
  accredited: '공학인증',
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'restore'; backup: PersonalBackup; preview: PersonalPreview }
  | { kind: 'reqset'; share: ReqsetShare; preview: SharePreview }
  | { kind: 'restart' }
  | { kind: 'reset' }

function formatDateTime(iso: string | null): string {
  if (!iso) return '아직 없음'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function SettingsTab() {
  const {
    state,
    reqSet,
    persistent,
    storageReason,
    exportPersonalBackup,
    exportActiveReqset,
    applyPersonalBackup,
    applyReqsetShare,
    restartOnboarding,
    resetAll,
  } = useAppState()

  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const [error, setError] = useState<string | null>(null)
  const [resetText, setResetText] = useState('')
  const backupInputRef = useRef<HTMLInputElement>(null)
  const reqsetInputRef = useRef<HTMLInputElement>(null)

  const { profile, courses, customSets, settings } = state
  const status = backupStatus(new Date(), courses.length, settings)
  const resetReady = resetText.trim() === RESET_CONFIRM_WORD
  const close = () => setDialog({ kind: 'none' })
  const openReset = () => {
    setResetText('')
    setDialog({ kind: 'reset' })
  }

  async function onPickBackup(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const parsed = parsePersonalBackup(await readFileText(file))
      if (!parsed.ok) {
        setError(parsed.message)
        return
      }
      setDialog({ kind: 'restore', backup: parsed.value.backup, preview: parsed.value.preview })
    } catch {
      setError('파일을 읽지 못했어요. 다시 시도해 주세요.')
    }
  }

  async function onPickReqset(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const parsed = parseReqsetShare(await readFileText(file))
      if (!parsed.ok) {
        setError(parsed.message)
        return
      }
      setDialog({ kind: 'reqset', share: parsed.value.share, preview: parsed.value.preview })
    } catch {
      setError('파일을 읽지 못했어요. 다시 시도해 주세요.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Card role="alert" className="flex items-start gap-2.5 border-orange/40 p-4">
          <Icon name="error" className="mt-px text-[18px] text-orange" />
          <div className="flex-1 text-[13px] text-ink-2">{error}</div>
          <button type="button" onClick={() => setError(null)} aria-label="닫기" className="text-muted-2 hover:text-ink-2">
            <Icon name="close" className="text-[18px]" />
          </button>
        </Card>
      )}

      {/* 내 정보 */}
      <Section title="내 정보">
        {profile ? (
          <>
            <div className="divide-y divide-line-2">
              <InfoRow label="학번" value={`${profile.admissionYear}학번`} />
              <InfoRow label="학과" value={profile.department} />
              <InfoRow label="과정" value={TRACK_LABEL[profile.trackType] ?? profile.trackType} />
              <InfoRow label="요건 세트" value={reqSet?.name ?? '—'} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line-2 px-4 py-3.5">
              <span className="text-[12px] leading-relaxed text-ink-3">
                학번·학과·과정을 다시 설정할래요? 과목과 요건 세트는 그대로 둡니다.
              </span>
              <Button
                variant="secondary"
                icon="restart_alt"
                onClick={() => setDialog({ kind: 'restart' })}
                className="shrink-0 !py-1.5 !text-[12px]"
              >
                온보딩 다시 하기
              </Button>
            </div>
          </>
        ) : (
          <p className="px-4 py-3 text-[13px] text-ink-3">아직 등록된 정보가 없어요.</p>
        )}
      </Section>

      {/* 데이터 (백업·복원) */}
      <Section title="데이터">
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="rounded-block bg-bg-soft px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] text-muted">마지막 백업</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">
                  {formatDateTime(settings.lastBackupAt)}
                  {status.daysSinceBackup != null && (
                    <span className="ml-1.5 text-[11.5px] font-medium text-muted">
                      {status.daysSinceBackup === 0 ? '오늘' : `${status.daysSinceBackup}일 전`}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-muted">저장된 데이터</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">
                  과목 {courses.length}건 · 세트 {customSets.length}개
                </div>
              </div>
            </div>
            {(status.neverBackedUp || (status.addedSinceBackup ?? 0) > 0) && (
              <div className="mt-2.5 flex items-start gap-1.5 border-t border-line/70 pt-2.5 text-[11.5px] leading-relaxed text-ink-3">
                <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
                <span>
                  {status.neverBackedUp
                    ? '아직 백업한 적이 없어요. 백업 파일을 받아두면 기기를 바꿔도 복원할 수 있어요.'
                    : `마지막 백업 후 과목을 ${status.addedSinceBackup}개 추가했어요.`}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="ios_share" onClick={exportPersonalBackup} disabled={!profile}>
              백업 받기
            </Button>
            <Button variant="secondary" icon="download" onClick={() => backupInputRef.current?.click()}>
              백업 불러오기
            </Button>
          </div>

          {/* 저장소 상태 — 색 단독 금지(아이콘+문구 병기) */}
          <div
            className={`flex items-start gap-2 rounded-block px-3.5 py-2.5 text-[11.5px] leading-relaxed ${
              persistent ? 'bg-bg-soft text-ink-3' : 'bg-orange/10 text-orange'
            }`}
          >
            <Icon
              name={persistent ? 'check_circle' : 'warning'}
              className={`mt-px shrink-0 text-[14px] ${persistent ? 'text-green' : 'text-orange'}`}
            />
            <p>
              {persistent
                ? '이 기기(브라우저)에 저장돼요. 백업 파일을 받아두면 다른 기기에서도 복원할 수 있어요.'
                : storageReason ?? '지금은 이 세션에서만 유지돼요. 꼭 백업 파일을 받아두세요.'}
            </p>
          </div>

          <div className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
            <Icon name="lock" className="mt-px text-[14px]" />
            <p>이 앱은 서버에 아무것도 저장하지 않습니다. 백업은 이 기기에 내려받는 JSON 파일이에요.</p>
          </div>
        </div>
      </Section>

      {/* 요건 세트 공유 */}
      <Section title="요건 세트 공유">
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            요건 세트만 담긴 파일로 내보내면 개인 데이터 없이 후배에게 전달할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="share" onClick={exportActiveReqset} disabled={!reqSet}>
              세트 공유 내보내기
            </Button>
            <Button variant="secondary" icon="content_paste" onClick={() => reqsetInputRef.current?.click()}>
              세트 공유 불러오기
            </Button>
          </div>
        </div>
      </Section>

      {/* 초기화 */}
      <Section title="초기화">
        <div className="px-4 py-4">
          <Button variant="danger" icon="restart_alt" onClick={openReset}>
            전체 초기화
          </Button>
        </div>
      </Section>

      {/* 숨은 파일 입력 */}
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onPickBackup(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={reqsetInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onPickReqset(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* 개인 백업 복원 미리보기 */}
      <Modal
        open={dialog.kind === 'restore'}
        onClose={close}
        title="백업 불러오기"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              취소
            </Button>
            <Button
              variant="primary"
              icon="download"
              onClick={() => {
                if (dialog.kind === 'restore') applyPersonalBackup(dialog.backup)
                close()
              }}
            >
              불러와서 덮어쓰기
            </Button>
          </>
        }
      >
        {dialog.kind === 'restore' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-block bg-bg-soft px-3.5 py-3 text-[12.5px]">
              <PreviewRow label="백업 일시" value={formatDateTime(dialog.preview.exportedAt)} />
              <PreviewRow
                label="학번 · 학과"
                value={`${dialog.preview.admissionYear ?? '—'}학번 · ${dialog.preview.department ?? '—'}`}
              />
              <PreviewRow label="과목" value={`${dialog.preview.courseCount}건`} />
              <PreviewRow label="커스텀 세트" value={`${dialog.preview.customSetCount}개`} />
            </div>
            {profile && (
              <div className="flex items-start gap-2 rounded-block bg-orange/10 px-3.5 py-2.5 text-[12px] text-orange">
                <Icon name="warning" className="mt-px shrink-0 text-[16px]" />
                <div className="flex-1">
                  불러오면 지금 데이터를 덮어씁니다. 먼저 백업해 두는 걸 권해요.
                  <button
                    type="button"
                    onClick={exportPersonalBackup}
                    className="ml-1 font-bold underline underline-offset-2"
                  >
                    현재 데이터 먼저 백업받기
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 요건 세트 공유 불러오기 */}
      <Modal
        open={dialog.kind === 'reqset'}
        onClose={close}
        title="요건 세트 불러오기"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              취소
            </Button>
            <Button
              variant="primary"
              icon="content_paste"
              onClick={() => {
                if (dialog.kind === 'reqset') applyReqsetShare(dialog.share)
                close()
              }}
            >
              세트 추가
            </Button>
          </>
        }
      >
        {dialog.kind === 'reqset' && (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-ink-3">이 요건 세트를 목록에 추가합니다(개인 데이터는 바뀌지 않아요).</div>
            <ul className="flex flex-col gap-1.5">
              {dialog.preview.sets.map((s) => (
                <li key={s.id} className="rounded-block bg-bg-soft px-3.5 py-2.5 text-[13px] font-semibold text-ink-2">
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {/* 온보딩 다시 하기 확인 */}
      <Modal
        open={dialog.kind === 'restart'}
        onClose={close}
        title="온보딩 다시 하기"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              취소
            </Button>
            <Button
              variant="primary"
              icon="restart_alt"
              onClick={() => {
                restartOnboarding()
                close()
              }}
            >
              다시 하기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>학번·학과·과정을 처음부터 다시 설정합니다.</p>
          <div className="flex items-start gap-2 rounded-block bg-bg-soft px-3.5 py-2.5 text-[12px] text-ink-3">
            <Icon name="info" className="mt-px shrink-0 text-[16px] text-blue" />
            <span className="flex-1">
              입력한 과목과 요건 세트는 지워지지 않고 그대로 유지돼요. 마법사를 마치면 요약 화면으로 돌아옵니다.
            </span>
          </div>
        </div>
      </Modal>

      {/* 전체 초기화 확인 — 확인 문구 입력(2단계) */}
      <Modal
        open={dialog.kind === 'reset'}
        onClose={close}
        title="전체 초기화"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              취소
            </Button>
            <Button
              variant="danger"
              icon="restart_alt"
              disabled={!resetReady}
              onClick={() => {
                if (!resetReady) return
                resetAll()
                close()
              }}
            >
              초기화
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>프로필·과목·비교과·커스텀 세트를 모두 지웁니다. 되돌릴 수 없어요.</p>
          {profile && (
            <div className="flex items-start gap-2 rounded-block bg-bg-soft px-3.5 py-2.5 text-[12px] text-ink-3">
              <Icon name="tips_and_updates" className="mt-px shrink-0 text-[16px] text-blue" />
              <div className="flex-1">
                초기화 전에 백업을 받아두면 언제든 되돌릴 수 있어요.
                <button
                  type="button"
                  onClick={exportPersonalBackup}
                  className="ml-1 font-bold text-blue underline underline-offset-2"
                >
                  먼저 백업받기
                </button>
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-ink-3">
              계속하려면 <b className="text-orange">{RESET_CONFIRM_WORD}</b>를 입력하세요.
            </span>
            <input
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              autoComplete="off"
              aria-label={`확인 문구 ${RESET_CONFIRM_WORD} 입력`}
              placeholder={RESET_CONFIRM_WORD}
              className="rounded-block border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-orange/60"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted-2">{title}</div>
      <Card>{children}</Card>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
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
