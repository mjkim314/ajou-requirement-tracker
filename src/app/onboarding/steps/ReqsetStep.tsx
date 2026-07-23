import { useEffect, useState } from 'react'
import { Button, Icon } from '../../ui'
import { OptionCard, StepIntro } from '../fields'
import { findPresetId, type OnboardingDraft, type ReqsetChoice } from '../model'
import { requirementSetRegistry } from '../../../data/index'
import { parseReqsetShare } from '../../../storage/backup'

interface Props {
  draft: OnboardingDraft
  patch: (p: Partial<OnboardingDraft>) => void
}

export function ReqsetStep({ draft, patch }: Props) {
  const presetId = findPresetId(
    requirementSetRegistry,
    draft.admissionYear,
    draft.department,
    draft.trackType,
  )
  const preset = presetId ? requirementSetRegistry[presetId] : null

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pasteNote, setPasteNote] = useState<string | null>(null)

  // 프리셋이 있으면 기본 선택(요건 확인·완료로 바로 이어지게). 사용자가 바꾸면 그 선택을 유지.
  useEffect(() => {
    if (preset && draft.reqset == null) patch({ reqset: { kind: 'preset', presetId: preset.id } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.id])

  const choice = draft.reqset
  // 같은 선택을 다시 눌러도 요건 확인에서 고친 값(reqEdits)이 사라지지 않게, 선택이 실제로 바뀔 때만 초기화.
  const set = (c: ReqsetChoice) => {
    if (sameChoice(choice, c)) return
    patch({ reqset: c, reqEdits: { totalCredits: null, minGPA: null, bucketMinCredits: {} } })
  }

  function onImport() {
    setPasteError(null)
    setPasteNote(null)
    const parsed = parseReqsetShare(pasteText)
    if (!parsed.ok) {
      setPasteError(parsed.message)
      return
    }
    const sets = parsed.value.share.requirementSets
    if (sets.length === 0) {
      setPasteError('세트가 비어 있어요.')
      return
    }
    // 여러 세트면 내 과정에 맞는 것을 고르고, 나머지가 유실됨을 안내한다.
    const chosen = sets.find((s) => s.trackType === draft.trackType) ?? sets[0]!
    set({ kind: 'shared', set: chosen })
    if (sets.length > 1) {
      setPasteNote(
        `${sets.length}개 세트 중 '${chosen.name}'을(를) 골랐어요. 나머지는 완료 후 요건 탭에서 불러올 수 있어요.`,
      )
    }
    setPasteOpen(false)
  }

  const sharedName = choice?.kind === 'shared' ? choice.set.name : null

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        icon="dataset"
        title="요건 세트 선택"
        desc="기본 템플릿으로 시작하거나, 빈 세트로 직접 구성하거나, 선배가 준 세트(JSON)를 붙여넣으세요."
      />

      <div className="flex flex-col gap-2.5">
        <OptionCard
          icon="verified"
          selected={choice?.kind === 'preset'}
          disabled={!preset}
          onClick={() => preset && set({ kind: 'preset', presetId: preset.id })}
          title={preset ? `기본 제공 · ${preset.name}` : '기본 제공 세트'}
          badge={preset ? '추천' : undefined}
          desc={
            preset
              ? '대학필수·학과필수·전공·교양/일반선택 뼈대가 채워져 있어요. 다음 단계에서 숫자를 검토·수정할 수 있어요.'
              : '이 학번·학과·과정에는 아직 기본 제공 세트가 없어요. 아래 빈 세트나 JSON으로 시작하세요.'
          }
        />

        <OptionCard
          icon="add_box"
          selected={choice?.kind === 'empty'}
          onClick={() => set({ kind: 'empty' })}
          title="빈 세트로 시작"
          desc="총 학점·최저 평점만 정하고 시작해요. 영역·필수 과목은 요건 탭 편집기에서 직접 추가합니다."
        />

        <OptionCard
          icon="content_paste"
          selected={choice?.kind === 'shared'}
          onClick={() => setPasteOpen((v) => !v)}
          title={sharedName ? `불러온 세트 · ${sharedName}` : 'JSON 붙여넣기'}
          desc="선배·동기가 공유한 요건 세트(JSON)를 붙여넣어 그대로 시작해요. 개인 데이터는 포함되지 않아요."
        />
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-2 rounded-block border border-line bg-bg-soft p-3.5">
          <label htmlFor="reqset-paste" className="text-[12px] font-bold text-ink-2">
            요건 세트 JSON
          </label>
          <textarea
            id="reqset-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder='{"app":"ajou-grad-tracker","type":"ajou-grad-reqset", ...}'
            className="w-full resize-y rounded-block border border-line bg-surface px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
          />
          {pasteError && (
            <div role="alert" className="flex items-start gap-1.5 text-[11.5px] font-medium text-orange">
              <Icon name="error" className="mt-px text-[14px]" />
              {pasteError}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" icon="download" onClick={onImport} disabled={!pasteText.trim()} className="!py-2 !text-[12px]">
              불러오기
            </Button>
            <Button variant="ghost" onClick={() => setPasteOpen(false)} className="!py-2 !text-[12px]">
              닫기
            </Button>
          </div>
        </div>
      )}

      {pasteNote && choice?.kind === 'shared' && (
        <div className="flex items-start gap-2 rounded-block bg-blue/[0.06] px-3.5 py-2.5 text-[11.5px] text-ink-2">
          <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
          <span>{pasteNote}</span>
        </div>
      )}
    </div>
  )
}

/** 두 요건 세트 선택이 같은가(같은 선택 재클릭 시 편집값 초기화를 피하려고 비교). */
function sameChoice(a: ReqsetChoice | null, b: ReqsetChoice): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'preset' && b.kind === 'preset') return a.presetId === b.presetId
  if (a.kind === 'shared' && b.kind === 'shared') return a.set.id === b.set.id
  return true // empty === empty
}
