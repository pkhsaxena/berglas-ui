import { useEffect, useLayoutEffect, useRef } from 'react'
import { type ComboOption, useCombo } from '../../../core/hooks/useCombo'

type Props = {
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  /** names the control and its search box (screen readers, the self-test) */
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  title?: string
}

/** A dropdown with substring search, used in place of <select>. */
export function Select({ value, options, onChange, ariaLabel, placeholder = 'pick…', disabled, title }: Props) {
  const c = useCombo({ options, value, onChange })
  const listRef = useRef<HTMLUListElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // c.pos is in viewport pixels; under the app's css zoom a fixed box's offsets
  // are scaled, so measure where it landed and rescale once
  useLayoutEffect(() => {
    const el = popRef.current
    if (!c.open || !el) return
    const want = c.pos.top
    const got = el.getBoundingClientRect().top
    if (want > 0 && Math.abs(got - want) > 1) {
      const k = want / got
      el.style.top = `${want * k}px`
      if (c.pos.left !== undefined) el.style.left = `${c.pos.left * k}px`
      if (c.pos.right !== undefined) el.style.right = `${c.pos.right * k}px`
    }
  }, [c.open, c.pos])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [c.index, c.open])
  return (
    <span className="combo" ref={c.rootRef}>
      <button
        ref={c.buttonRef}
        type="button"
        className="combo-btn"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={c.open}
        aria-controls={c.listId}
        data-value={value}
        disabled={disabled}
        title={title}
        onClick={c.toggle}
        onKeyDown={c.onButtonKeyDown}
      >
        <span className={c.current ? undefined : 'muted'}>{c.current?.label ?? placeholder}</span>
        <span className="combo-caret" aria-hidden>
          ▾
        </span>
      </button>
      {c.open && (
        <div ref={popRef} className="combo-pop" style={{ top: c.pos.top, left: c.pos.left, right: c.pos.right }} data-find-ignore>
          <input
            ref={c.inputRef}
            type="search"
            aria-label={`search ${ariaLabel}`}
            placeholder="search…"
            value={c.query}
            onChange={(e) => c.setQuery(e.target.value)}
            onKeyDown={c.onInputKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <ul id={c.listId} ref={listRef} role="listbox" aria-label={ariaLabel}>
            {c.shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                data-value={o.value}
                aria-selected={i === c.index}
                aria-checked={o.value === value}
                aria-disabled={o.disabled || undefined}
                onMouseMove={() => i !== c.index && c.setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => c.choose(o)}
              >
                <span className="combo-check" aria-hidden>
                  {o.value === value ? '>' : ''}
                </span>
                <span>{o.label}</span>
                {o.hint && <span className="muted small combo-hint">{o.hint}</span>}
              </li>
            ))}
            {c.shown.length === 0 && <li className="muted combo-empty"># no matches</li>}
          </ul>
        </div>
      )}
    </span>
  )
}
