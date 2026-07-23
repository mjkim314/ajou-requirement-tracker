import { useMemo, useState } from 'react'
import type { CatalogEntry } from '../../../engine/index'
import { catalogByKey } from '../../courses'
import type { SearchDoc } from '../../search'
import { Icon } from '../../ui'
import { CourseAutocomplete } from '../courses/CourseAutocomplete'

interface Props {
  /** 현재 담긴 courseKey 목록. */
  courseKeys: string[]
  catalog: CatalogEntry[]
  /** 카탈로그가 바뀔 때만 재생성한 검색 인덱스. */
  docs: SearchDoc[]
  onAdd: (courseKey: string) => void
  onRemove: (courseKey: string) => void
  emptyHint?: string
}

/**
 * courseKey 칩 목록 + 카탈로그 자동완성 추가.
 * 요건은 이름이 아니라 courseKey로 참조하므로(아키텍처 규칙 4), 칩은 courseKey를 담고
 * 표시만 카탈로그 이름으로 한다. 카탈로그에 없는 과목은 courseKey를 직접 입력해 추가할 수 있다.
 */
export function CoursePicker({ courseKeys, catalog, docs, onAdd, onRemove, emptyHint }: Props) {
  const [text, setText] = useState('')
  const catMap = useMemo(() => catalogByKey(catalog), [catalog])
  const trimmed = text.trim()
  const canAddRaw = trimmed.length > 0 && !courseKeys.includes(trimmed)

  function add(key: string) {
    onAdd(key)
    setText('')
  }

  return (
    <div className="flex flex-col gap-2">
      {courseKeys.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {courseKeys.map((k) => {
            const name = catMap.get(k)?.name
            return (
              <li
                key={k}
                className="inline-flex items-center gap-1.5 rounded-chip bg-bg-soft py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-ink-2"
              >
                <span className="truncate">{name ?? k}</span>
                {!name && (
                  <span
                    className="shrink-0 rounded-chip bg-orange/10 px-1 py-0.5 text-[9.5px] font-bold text-orange"
                    title="카탈로그 밖 courseKey"
                  >
                    코드
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(k)}
                  aria-label={`${name ?? k} 제거`}
                  className="shrink-0 rounded-chip p-0.5 text-muted-2 hover:bg-line-2 hover:text-ink-2"
                >
                  <Icon name="close" className="text-[14px]" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <CourseAutocomplete
        value={text}
        resolved={false}
        docs={docs}
        onPick={(e) => add(e.courseKey)}
        onType={setText}
      />

      {canAddRaw && (
        <button
          type="button"
          onClick={() => add(trimmed)}
          className="inline-flex items-center gap-1 self-start text-[11.5px] font-semibold text-blue hover:text-navy"
        >
          <Icon name="add" className="text-[15px]" />
          ‘{trimmed}’ 직접 추가
          <span className="font-normal text-muted-2">(카탈로그 밖 courseKey)</span>
        </button>
      )}

      {courseKeys.length === 0 && !canAddRaw && emptyHint && (
        <p className="text-[11px] leading-relaxed text-muted-2">{emptyHint}</p>
      )}
    </div>
  )
}
