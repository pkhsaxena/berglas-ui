import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ComboOption } from '../../../core/hooks/useCombo'
import { useSuggest } from '../../../core/hooks/useSuggest'

type Props = {
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  /** names the field and its list (screen readers, the self-test) */
  ariaLabel: string
  id?: string
  placeholder?: string
  className?: string
  /** brackets that close themselves as they are typed (see autopair.ts) */
  autoPair?: Record<string, string>
}

/** A text field with suggestions under it, in the dropdowns' style (see useSuggest). */
export function SuggestInput({ value, onChange, options, ariaLabel, id, placeholder, className, autoPair }: Props) {
  const s = useSuggest({ value, onChange, options, autoPair })
  const popRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // s.pos is in viewport pixels; under the app's css zoom a fixed box's offsets are scaled, so measure where it landed and rescale once
  useLayoutEffect(() => {
    const el = popRef.current
    if (!s.visible || !el) return
    const want = s.pos.top
    const got = el.getBoundingClientRect().top
    if (want > 0 && Math.abs(got - want) > 1) {
      const k = want / got
      el.style.top = `${want * k}px`
      el.style.left = `${s.pos.left * k}px`
      el.style.minWidth = `${s.pos.width * k}px`
    }
  }, [s.visible, s.pos])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [s.index, s.visible])
  return (
    <span className="suggest" ref={s.rootRef}>
      <input id={id} className={className} aria-label={ariaLabel} placeholder={placeholder} {...s.inputProps} />
      {s.visible && (
        <div ref={popRef} className="combo-pop suggest-pop" style={{ top: s.pos.top, left: s.pos.left, minWidth: s.pos.width }} data-find-ignore>
          <ul id={s.listId} ref={listRef} role="listbox" aria-label={`${ariaLabel} suggestions`}>
            {s.shown.map((o, i) => (
              <li
                key={o.value}
                id={`${s.listId}-${i}`}
                role="option"
                data-value={o.value}
                aria-selected={i === s.index}
                aria-checked={o.value === value}
                onMouseMove={() => i !== s.index && s.setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => s.pick(o)}
              >
                <span className="combo-check" aria-hidden>
                  {o.value === value ? '>' : ''}
                </span>
                <span>{o.label}</span>
                {o.hint && <span className="muted small combo-hint">{o.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
