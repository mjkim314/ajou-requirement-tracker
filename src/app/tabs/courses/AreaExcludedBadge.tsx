import { areaLabel } from '../../../data/merge'
import { Icon } from '../../ui'

/**
 * "영역별교양 미인정" 배지.
 *
 * 소속 계열의 영역(이공계=자연과 과학) 과목은 목록·자동완성에 그대로 보이되,
 * 영역별교양으로는 집계되지 않는다는 걸 여기서 알린다. 겁주지 않고 사실만:
 * 학점이 사라지는 게 아니라 일반선택으로 들어간다.
 * 색 단독 금지 — 아이콘·텍스트 병기(색맹 대응).
 */
export function AreaExcludedBadge({ areaId, compact }: { areaId: string; compact?: boolean }) {
  return (
    <span
      title={areaExcludedHint(areaId)}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-chip bg-orange/10 px-1.5 py-0.5 text-[10px] font-bold text-orange"
    >
      <Icon name="do_not_disturb_on" className="text-[12px]" />
      {compact ? '영역 미인정' : '영역별교양 미인정'}
    </span>
  )
}

/** 폼·툴팁에서 쓰는 한 줄 설명. */
export function areaExcludedHint(areaId: string): string {
  return `${topicParticle(areaLabel(areaId))} 소속 계열 영역이라 영역별교양으로 인정되지 않아요. 학점은 일반선택으로 집계돼요.`
}

/** 한국어 주제 조사(은/는)를 받침 유무로 붙인다 — "자연과 과학은(는)" 같은 표기를 피한다. */
function topicParticle(word: string): string {
  const last = word.codePointAt(word.length - 1) ?? 0
  const hangul = last >= 0xac00 && last <= 0xd7a3
  const hasJongseong = hangul && (last - 0xac00) % 28 !== 0
  // 한글이 아니면(영문 id 등) 조사를 생략해 어색한 표기를 만들지 않는다.
  return hangul ? `${word}${hasJongseong ? '은' : '는'}` : word
}
