import { useId, useState } from 'react'
import { Icon } from '../../ui'
import { Field, Segmented, SegmentedControlNote, SelectField, StepIntro, TextField } from '../fields'
import {
  TRACK_INFO,
  TRACK_ORDER,
  admissionYearOptions,
  departmentHasPreset,
  findPresetId,
  type OnboardingDraft,
  type TrackType,
} from '../model'
import { AJOU_COLLEGES, findDepartment } from '../../../data/ajou-departments'
import { requirementSetRegistry } from '../../../data/index'

const CUSTOM = '__custom__'

interface Props {
  draft: OnboardingDraft
  patch: (p: Partial<OnboardingDraft>) => void
  nowYear: number
}

export function ProfileStep({ draft, patch, nowYear }: Props) {
  const yearId = useId()
  const deptId = useId()
  // 직접 입력 모드: 현재 학과가 큐레이션 목록에 없으면(=사용자가 직접 친 값) custom.
  const knownDept = draft.department ? findDepartment(draft.department) : null
  const [customMode, setCustomMode] = useState<boolean>(!!draft.department && !knownDept)

  // 학번·학과·과정이 바뀌면 하위 선택(요건 세트·추가전공·예외·편집값)을 초기화해 불일치를 막는다.
  // 추가전공 템플릿·기본값은 연도/학과/과정에 의존하므로, 정체성이 바뀌면 이전 선택을 버린다.
  const resetDownstream: Partial<OnboardingDraft> = {
    reqset: null,
    additionalMajors: [],
    exemptions: [],
    reqEdits: { totalCredits: null, minGPA: null, bucketMinCredits: {} },
  }

  function onYear(v: string) {
    patch({ admissionYear: v ? Number(v) : null, ...resetDownstream })
  }
  function onTrack(v: TrackType) {
    patch({ trackType: v, ...resetDownstream })
  }
  function onDeptSelect(v: string) {
    if (v === CUSTOM) {
      setCustomMode(true)
      patch({ department: '', departmentSlug: null, college: '', ...resetDownstream })
      return
    }
    setCustomMode(false)
    const d = findDepartment(v)
    patch({
      department: v,
      departmentSlug: d?.slug ?? null,
      college: d?.college ?? '',
      ...resetDownstream,
    })
  }
  function onCustomDept(v: string) {
    patch({ department: v, departmentSlug: null, ...resetDownstream })
  }

  const track = draft.trackType
  const hasPreset =
    findPresetId(requirementSetRegistry, draft.admissionYear, draft.department, track) != null
  const deptHasAnyPreset = departmentHasPreset(
    requirementSetRegistry,
    draft.admissionYear,
    draft.department,
  )
  const missingData = knownDept?.curriculumDataMissing ?? false

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        icon="badge"
        title="먼저, 내 정보를 알려주세요"
        desc="이 정보로 맞는 요건 세트를 불러옵니다. 모든 데이터는 이 기기에만 저장돼요."
      />

      <Field label="학번(입학연도)" htmlFor={yearId}>
        <SelectField id={yearId} value={draft.admissionYear?.toString() ?? ''} onChange={onYear} ariaLabel="학번">
          <option value="" disabled>
            선택하세요
          </option>
          {admissionYearOptions(nowYear).map((y) => (
            <option key={y} value={y}>
              {String(y).slice(2)}학번 ({y})
            </option>
          ))}
        </SelectField>
      </Field>

      <Field label="학과" htmlFor={deptId} hint="목록에 없으면 '직접 입력'을 고르세요. 아주대 현행 학과 기준입니다.">
        {customMode ? (
          <div className="flex flex-col gap-2">
            <TextField
              value={draft.department}
              onChange={onCustomDept}
              placeholder="학과명을 입력하세요 (예: 소프트웨어학과)"
              ariaLabel="학과 직접 입력"
            />
            <button
              type="button"
              onClick={() => {
                setCustomMode(false)
                patch({ department: '', departmentSlug: null, college: '', ...resetDownstream })
              }}
              className="self-start text-[11.5px] font-semibold text-blue hover:underline"
            >
              ← 목록에서 고르기
            </button>
          </div>
        ) : (
          <SelectField id={deptId} value={knownDept?.name ?? ''} onChange={onDeptSelect} ariaLabel="학과">
            <option value="" disabled>
              선택하세요
            </option>
            {AJOU_COLLEGES.map((c) => (
              <optgroup key={c.college} label={c.college}>
                {c.departments.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                    {departmentHasPreset(requirementSetRegistry, draft.admissionYear, d.name)
                      ? ' · 기본 제공'
                      : ''}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="기타">
              <option value={CUSTOM}>직접 입력…</option>
            </optgroup>
          </SelectField>
        )}
      </Field>

      {/* 학과 선택 결과 안내 — 프리셋/빈 세트/데이터 미비 */}
      {draft.department && draft.admissionYear != null && track && (
        <DeptHint hasPreset={hasPreset} deptHasAnyPreset={deptHasAnyPreset} missingData={missingData} />
      )}

      <Field label="과정 구분">
        <Segmented<TrackType>
          legend="과정 구분"
          value={track}
          onChange={onTrack}
          options={TRACK_ORDER.map((t) => ({ value: t, label: TRACK_INFO[t].label }))}
        />
        {track && <SegmentedControlNote>{TRACK_INFO[track].desc}</SegmentedControlNote>}
      </Field>
    </div>
  )
}

function DeptHint({
  hasPreset,
  deptHasAnyPreset,
  missingData,
}: {
  hasPreset: boolean
  deptHasAnyPreset: boolean
  missingData: boolean
}) {
  if (hasPreset) {
    return (
      <div className="flex items-start gap-2 rounded-block bg-green/10 px-3.5 py-2.5 text-[12px] text-green">
        <Icon name="verified" className="mt-px shrink-0 text-[16px]" />
        <span className="font-medium text-ink-2">
          이 학번·학과·과정의 <b className="text-green">기본 제공 요건 세트</b>가 있어요. 다음 단계에서 바로 불러올 수 있습니다.
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-block bg-blue/[0.06] px-3.5 py-2.5 text-[12px] text-ink-2">
      <Icon name="info" className="mt-px shrink-0 text-[16px] text-blue" />
      <span>
        {missingData
          ? '이 학과는 요건 데이터가 아직 없어요. '
          : deptHasAnyPreset
            ? '이 학과에 다른 학번·과정 프리셋은 있지만, 이 조합은 아직 없어요. '
            : '이 조합은 아직 기본 제공 세트가 없어요. '}
        <b>빈 세트로 시작</b>해 요건을 직접 채우거나, 선배가 준 세트(JSON)를 불러올 수 있어요.
      </span>
    </div>
  )
}
