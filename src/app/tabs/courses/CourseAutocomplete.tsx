import { useId, useMemo, useRef, useState } from 'react'
import type { CatalogEntry } from '../../../engine/index'
import { searchDocs, type SearchDoc } from '../../search'
import { Icon } from '../../ui'
import { AreaExcludedBadge } from './AreaExcludedBadge'

const INPUT_CLASS =
  'w-full rounded-block border border-line bg-surface px-3.5 py-3 text-[14px] font-medium text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-blue focus:ring-2 focus:ring-blue/20'

interface Props {
  /** 현재 입력 텍스트(= nameSnapshot). */
  value: string
  /** 카탈로그로 확정됐는지(courseKey 존재). */
  resolved: boolean
  /** 미리 만든 검색 인덱스(카탈로그가 바뀔 때만 재생성). */
  docs: SearchDoc[]
  /** 카탈로그 항목 선택 — courseKey·학점·영역을 확정. */
  onPick: (entry: CatalogEntry) => void
  /** 자유 입력 — 카탈로그 미확인(courseKey=null). */
  onType: (text: string) => void
  /** 이 과목이 소속 계열 제외 영역이면 영역 id(아니면 null). 후보에 "영역별교양 미인정"을 붙인다. */
  excludedAreaOf?: (entry: CatalogEntry) => string | null
  id?: string
  describedBy?: string
}

/**
 * 과목명 검색 자동완성(콤보박스). 과목명·학수번호·초성으로 카탈로그를 찾는다.
 * 키보드: ↑/↓ 이동, Enter 선택, Esc 닫기. 접근성은 combobox/listbox/option 역할로.
 */
export function CourseAutocomplete({
  value,
  resolved,
  docs,
  onPick,
  onType,
  excludedAreaOf,
  id,
  describedBy,
}: Props) {
  const autoId = useId()
  const listId = `${autoId}-list`
  const inputId = id ?? autoId
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | undefined>(undefined)

  const suggestions = useMemo(() => searchDocs(value, docs, 8), [value, docs])
  const showList = open && value.trim().length > 0 && suggestions.length > 0

  function choose(entry: CatalogEntry) {
    onPick(entry)
    setOpen(false)
    setActive(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true)
        setActive(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => (i + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter': {
        const pick = suggestions[active]
        if (pick) {
          e.preventDefault()
          choose(pick)
        }
        break
      }
      case 'Escape':
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          value={value}
          placeholder="과목명·학수번호·초성으로 검색"
          className={`${INPUT_CLASS} pr-10`}
          onChange={(e) => {
            onType(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // 목록 클릭이 blur보다 먼저 처리되도록 살짝 늦춰 닫는다.
            blurTimer.current = window.setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={onKeyDown}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          {resolved ? (
            <Icon name="check_circle" className="text-[18px] text-green" />
          ) : (
            <Icon name="search" className="text-[18px] text-muted-2" />
          )}
        </span>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-block border border-line bg-surface py-1 shadow-card"
        >
          {suggestions.map((entry, i) => {
            const isActive = i === active
            const code = entry.codes?.[0]
            const excludedArea = excludedAreaOf?.(entry) ?? null
            return (
              <li
                key={entry.courseKey}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isActive}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] ${
                  isActive ? 'bg-blue/10' : 'hover:bg-bg-soft'
                }`}
                // onMouseDown(pointerdown)로 처리해 input blur보다 먼저 선택되게 한다.
                onMouseDown={(e) => {
                  e.preventDefault()
                  window.clearTimeout(blurTimer.current)
                  choose(entry)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="flex-1 truncate font-medium text-ink">{entry.name}</span>
                {excludedArea && <AreaExcludedBadge areaId={excludedArea} compact />}
                {code && (
                  <span className="shrink-0 rounded-chip bg-bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
                    {code}
                  </span>
                )}
                <span className="shrink-0 text-[11.5px] text-muted-2">{entry.credits}학점</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
