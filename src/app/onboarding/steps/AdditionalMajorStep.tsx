import { Button, Icon } from '../../ui'
import { CheckRow, Field, NumberField, StepIntro, TextField } from '../fields'
import {
  TRACK_INFO,
  baseReqSet,
  majorPolicyWarning,
  makeAdditionalMajorDraft,
  requiresAdditionalMajor,
  type AdditionalMajorDraft,
  type OnboardingDraft,
} from '../model'
import { additionalMajorTemplates } from '../../dataSources'
import { requirementSetRegistry } from '../../../data/index'

interface Props {
  draft: OnboardingDraft
  patch: (p: Partial<OnboardingDraft>) => void
}

function rid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return `am-${c.randomUUID()}`
  return `am-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function AdditionalMajorStep({ draft, patch }: Props) {
  const reqSet = baseReqSet(draft, requirementSetRegistry)
  const templates = additionalMajorTemplates(reqSet, draft.admissionYear, draft.department)
  const required = requiresAdditionalMajor(draft, reqSet)
  const list = draft.additionalMajors
  const warning = majorPolicyWarning(draft, reqSet)

  const addAm = (index: number) => {
    const rule = templates[index]
    if (!rule) return
    patch({ additionalMajors: [...list, makeAdditionalMajorDraft(rule, rid())] })
  }
  const updateAm = (instanceId: string, p: Partial<AdditionalMajorDraft>) =>
    patch({ additionalMajors: list.map((a) => (a.instanceId === instanceId ? { ...a, ...p } : a)) })
  const removeAm = (instanceId: string) =>
    patch({ additionalMajors: list.filter((a) => a.instanceId !== instanceId) })

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        icon="account_tree"
        title="추가 전공"
        desc={
          required
            ? '이 과정은 복수전공·부전공 등 추가 전공을 1개 이상 이수해야 해요. 유형을 고르면 기본 학점이 채워지고, 값은 자유롭게 수정할 수 있어요.'
            : '추가 전공은 선택 사항이에요. 계획이 있으면 등록해 두면 진행률에 함께 반영돼요.'
        }
      />

      {required && list.length === 0 && (
        <div className="flex items-start gap-2 rounded-block bg-orange/10 px-3.5 py-2.5 text-[12px] text-orange">
          <Icon name="priority_high" className="mt-px shrink-0 text-[16px]" />
          <span className="font-medium">추가 전공을 1개 이상 등록해야 다음으로 넘어갈 수 있어요.</span>
        </div>
      )}

      {/* 등록된 추가 전공 */}
      {list.length > 0 && (
        <div className="flex flex-col gap-3">
          {list.map((am) => (
            <div key={am.instanceId} className="rounded-block border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-chip bg-navy/[0.06] px-2 py-1 text-[11.5px] font-bold text-navy">
                  <Icon name="account_tree" className="text-[14px]" />
                  {am.typeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => removeAm(am.instanceId)}
                  aria-label={`${am.typeLabel} 삭제`}
                  className="rounded-chip p-1 text-muted-2 hover:bg-bg-soft hover:text-orange"
                >
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <Field label="이름">
                  <TextField
                    value={am.displayName}
                    onChange={(v) => updateAm(am.instanceId, { displayName: v })}
                    placeholder={am.typeLabel}
                    ariaLabel="추가 전공 이름"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="필요 학점">
                    <NumberField
                      value={am.totalMinCredits}
                      onChange={(v) => updateAm(am.instanceId, { totalMinCredits: v ?? 0 })}
                      min={0}
                      suffix="학점"
                      ariaLabel="필요 학점"
                    />
                  </Field>
                  <Field label="제1전공 중복 인정" hint="제1전공과 겹치는 과목을 이 상한까지 인정">
                    <NumberField
                      value={am.homeOverlapCap}
                      onChange={(v) => updateAm(am.instanceId, { homeOverlapCap: v ?? 0 })}
                      min={0}
                      suffix="학점"
                      ariaLabel="제1전공 중복 인정 상한"
                    />
                  </Field>
                </div>
                <CheckRow
                  checked={am.satisfiesMajorPolicy}
                  onChange={(v) => updateAm(am.instanceId, { satisfiesMajorPolicy: v })}
                  title="전공 이수원칙을 충족하는 유형"
                  desc="일반과정의 '추가 전공 1건' 요건을 이 전공으로 채울 수 있으면 켜세요(복수·부전공은 보통 충족, 트랙·마이크로는 학과 확인 필요)."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {warning && (
        <div className="flex items-start gap-2 rounded-block bg-orange/10 px-3.5 py-2.5 text-[12px] text-orange">
          <Icon name="warning" className="mt-px shrink-0 text-[16px]" />
          <span className="font-medium">{warning}</span>
        </div>
      )}

      {/* 유형 추가 */}
      <div>
        <div className="mb-2 text-[12px] font-bold text-ink-2">유형 추가</div>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addAm(i)}
              className="flex items-center justify-between gap-2 rounded-block border border-line bg-surface px-3 py-2.5 text-left text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-navy/30 hover:bg-bg-soft"
            >
              <span className="min-w-0 truncate">{t.name}</span>
              <Icon name="add" className="shrink-0 text-[16px] text-blue" />
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          {TRACK_INFO[draft.trackType ?? 'advanced'].label} · 기본 학점·중복 상한은 요람 기준 추정값이라 학과 요람과 대조해 고치세요.
        </p>
      </div>
    </div>
  )
}
