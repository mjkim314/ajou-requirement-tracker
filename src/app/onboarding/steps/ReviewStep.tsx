import { Icon } from '../../ui'
import { Field, NumberField, StepIntro, UnverifiedBadge } from '../fields'
import {
  DEFAULT_MIN_GPA,
  DEFAULT_TOTAL_CREDITS,
  baseReqSet,
  type OnboardingDraft,
  type ReqEdits,
} from '../model'
import { requirementSetRegistry } from '../../../data/index'
import { BUCKET_GROUPS } from '../../reqset-editor'
import type { Bucket } from '../../../engine/index'

interface Props {
  draft: OnboardingDraft
  patch: (p: Partial<OnboardingDraft>) => void
}

const GROUP_LABEL: Record<string, string> = {
  university_required: '대학필수',
  department_required: '학과필수',
  major_required: '전공필수',
  major_elective: '전공선택',
  general_elective: '일반선택',
  // 구버전 세트 호환(온보딩 clone-on-edit 이전 값)
  major: '전공',
  free: '일반선택',
}

// 카테고리 정렬 순서 — 편집기 그룹 정의(단일 출처)를 따른다.
const GROUP_ORDER: string[] = BUCKET_GROUPS.map((g) => g.value)

/** 영역을 카테고리로 묶는다(대학필수·학과필수·전공필수·전공선택·일반선택 순, 미등록 그룹은 뒤). */
function groupBucketsByCategory(
  buckets: Bucket[],
): { group: string; label: string; buckets: Bucket[] }[] {
  const byGroup = new Map<string, Bucket[]>()
  for (const b of buckets) {
    const list = byGroup.get(b.group)
    if (list) list.push(b)
    else byGroup.set(b.group, [b])
  }
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g)
    return i < 0 ? GROUP_ORDER.length : i
  }
  return [...byGroup.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((group) => ({ group, label: GROUP_LABEL[group] ?? group, buckets: byGroup.get(group)! }))
}

export function ReviewStep({ draft, patch }: Props) {
  const reqSet = baseReqSet(draft, requirementSetRegistry)
  const edits = draft.reqEdits
  const isPresetClone = draft.reqset?.kind === 'preset'

  const setEdit = (p: Partial<ReqEdits>) => patch({ reqEdits: { ...edits, ...p } })
  const setBucket = (id: string, v: number | null) =>
    setEdit({ bucketMinCredits: { ...edits.bucketMinCredits, [id]: v ?? 0 } })

  const source = reqSet?.source as Record<string, unknown> | undefined
  const unverified = source?.['verified'] === false
  const notes = Array.isArray(source?.['notes']) ? (source!['notes'] as string[]) : []

  const totalValue = edits.totalCredits ?? reqSet?.totalCredits ?? null
  const gpaValue = edits.minGPA ?? reqSet?.minGPA ?? null

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        icon="fact_check"
        title="요건 확인"
        desc="앱이 채운 숫자를 내 요람과 대조하고, 다르면 바로 고치세요. 이 단계가 가장 중요해요."
      />

      {isPresetClone && (
        <div className="flex items-start gap-2 rounded-block bg-blue/[0.06] px-3.5 py-2.5 text-[11.5px] text-ink-2">
          <Icon name="edit_note" className="mt-px shrink-0 text-[15px] text-blue" />
          <p>여기서 숫자를 고치면 원본 프리셋은 그대로 두고 <b>내 편집본</b>이 따로 만들어져요.</p>
        </div>
      )}

      {(unverified || notes.length > 0) && (
        <div className="rounded-block border border-orange/30 bg-orange/[0.06] p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-orange">
            <Icon name="help" className="text-[16px]" />
            확인이 필요한 항목
          </div>
          <ul className="ml-0.5 flex list-none flex-col gap-1 text-[11.5px] leading-relaxed text-ink-2">
            {notes.length > 0 ? (
              notes.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-orange">·</span>
                  <span>{n}</span>
                </li>
              ))
            ) : (
              <li>이 세트는 학과 확인 전 값이에요. 요람과 대조해 주세요.</li>
            )}
          </ul>
        </div>
      )}

      {/* 핵심 숫자 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="졸업 총 학점">
          <NumberField
            value={totalValue}
            onChange={(v) => setEdit({ totalCredits: v })}
            min={0}
            suffix="학점"
            placeholder={reqSet ? undefined : `예: ${DEFAULT_TOTAL_CREDITS}`}
            ariaLabel="졸업 총 학점"
          />
        </Field>
        <Field label="졸업 최저 평점">
          <NumberField
            value={gpaValue}
            onChange={(v) => setEdit({ minGPA: v })}
            min={0}
            max={4.5}
            step={0.1}
            placeholder={reqSet ? undefined : `예: ${DEFAULT_MIN_GPA.toFixed(1)}`}
            ariaLabel="졸업 최저 평점"
          />
        </Field>
      </div>

      {reqSet ? (
        reqSet.buckets.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-ink-2">
              영역별 최소 학점
              {unverified && <UnverifiedBadge />}
            </div>
            <div className="flex flex-col gap-3">
              {groupBucketsByCategory(reqSet.buckets).map((cat) => (
                <div key={cat.group} className="overflow-hidden rounded-block border border-line">
                  <div className="bg-bg-soft px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    {cat.label}
                  </div>
                  <div className="flex flex-col divide-y divide-line-2 border-t border-line">
                    {cat.buckets.map((b) => (
                      <BucketRow
                        key={b.id}
                        bucket={b}
                        value={edits.bucketMinCredits[b.id] ?? b.minCredits}
                        onChange={(v) => setBucket(b.id, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="flex items-start gap-2 rounded-block bg-bg-soft px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
          <Icon name="info" className="mt-px shrink-0 text-[14px] text-blue" />
          <p>
            빈 세트예요. 지금은 총 학점·최저 평점만 정하고, 영역(전공필수·교양 등)과 필수 과목은 완료 후
            <b> 요건 탭</b>에서 추가하세요. 비워두면 총 {DEFAULT_TOTAL_CREDITS}학점·최저{' '}
            {DEFAULT_MIN_GPA.toFixed(1)}으로 시작해요.
          </p>
        </div>
      )}
    </div>
  )
}

function BucketRow({
  bucket,
  value,
  onChange,
}: {
  bucket: Bucket
  value: number
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3.5 py-2.5">
      <div className="min-w-0 truncate text-[13px] font-semibold text-ink-2">{bucket.label}</div>
      <div className="w-28 shrink-0">
        <NumberField value={value} onChange={onChange} min={0} suffix="학점" ariaLabel={`${bucket.label} 최소 학점`} />
      </div>
    </div>
  )
}
