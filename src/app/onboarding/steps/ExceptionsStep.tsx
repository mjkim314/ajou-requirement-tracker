import { useId } from 'react'
import { Icon } from '../../ui'
import { CheckRow, Field, SelectField, StepIntro } from '../fields'
import {
  EXEMPTION_LABELS,
  baseReqSet,
  semesterLabel,
  semesterOptions,
  type OnboardingDraft,
} from '../model'
import { requirementSetRegistry } from '../../../data/index'

interface Props {
  draft: OnboardingDraft
  patch: (p: Partial<OnboardingDraft>) => void
}

export function ExceptionsStep({ draft, patch }: Props) {
  const curId = useId()
  const tgtId = useId()
  const options = semesterOptions(draft.admissionYear)
  const reqSet = baseReqSet(draft, requirementSetRegistry)
  const exemptions = reqSet?.majorPolicy?.exemptions ?? []

  const toggleExemption = (id: string, on: boolean) =>
    patch({
      exemptions: on
        ? [...new Set([...draft.exemptions, id])]
        : draft.exemptions.filter((e) => e !== id),
    })

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        icon="event"
        title="학기와 예외 사항"
        desc="남은 학기 계산과 요건 면제에 쓰여요. 비워 둬도 진행할 수 있어요."
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="현재 학기" htmlFor={curId}>
          <SelectField
            id={curId}
            value={draft.currentSemester}
            onChange={(v) => patch({ currentSemester: v })}
            ariaLabel="현재 학기"
          >
            <option value="">선택 안 함</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="목표 졸업 학기" htmlFor={tgtId}>
          <SelectField
            id={tgtId}
            value={draft.targetGraduation}
            onChange={(v) => patch({ targetGraduation: v })}
            ariaLabel="목표 졸업 학기"
          >
            <option value="">선택 안 함</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s)}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>

      <Field label="학적">
        <CheckRow
          checked={draft.isTransferStudent}
          onChange={(v) => patch({ isTransferStudent: v })}
          title="편입생이에요"
          desc="편입 인정 학점 등 이후 과목 입력에서 편입 처리를 도와줘요."
        />
      </Field>

      {exemptions.length > 0 ? (
        <Field label="요건 면제(해당 시 선택)">
          <div className="flex flex-col gap-2">
            {exemptions.map((id) => (
              <CheckRow
                key={id}
                checked={draft.exemptions.includes(id)}
                onChange={(on) => toggleExemption(id, on)}
                title={EXEMPTION_LABELS[id] ?? id}
                desc="해당하면 전공 이수원칙(복수/부전공 필수) 등이 면제돼요."
              />
            ))}
          </div>
        </Field>
      ) : (
        <div className="flex items-start gap-2 rounded-block bg-bg-soft px-3.5 py-2.5 text-[11.5px] text-ink-3">
          <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
          <p>이 요건 세트에는 정의된 면제 항목이 없어요. 필요하면 요건 탭에서 나중에 추가할 수 있어요.</p>
        </div>
      )}
    </div>
  )
}
