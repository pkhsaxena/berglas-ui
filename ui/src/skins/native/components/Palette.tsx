import { useEffect, useRef } from 'react'
import type { PaletteState } from '../../../core/hooks/usePalette'

/** ⌘K: jump to a secret, switch source or run an action. */
export function Palette({ p }: { p: PaletteState }) {
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [p.index, p.results])
  if (!p.open) return null
  let last = ''
  return (
    <div className="palette-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && p.close()}>
      <div className="palette" role="dialog" aria-label="command palette">
        <input
          ref={p.inputRef}
          type="search"
          aria-label="go to"
          placeholder="Go to a secret, source or action…"
          value={p.query}
          onChange={(e) => p.setQuery(e.target.value)}
          onKeyDown={p.onKeyDown}
          aria-controls="palette-list"
          aria-activedescendant={p.results[p.index] ? `pal-${p.index}` : undefined}
        />
        <ul id="palette-list" ref={listRef} role="listbox" className="palette-list">
          {p.results.map((it, i) => {
            const head = it.group !== last ? it.group : null
            last = it.group
            return (
              <li key={it.id} role="presentation">
                {head && <div className="palette-group">{head}</div>}
                <div
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === p.index}
                  className="palette-item"
                  onMouseMove={() => i !== p.index && p.setIndex(i)}
                  onClick={() => p.choose(it)}
                >
                  <span className={it.group === 'Secrets' ? 'mono' : undefined}>{it.label}</span>
                  {it.hint && <span className="muted small">{it.hint}</span>}
                </div>
              </li>
            )
          })}
          {p.results.length === 0 && <li className="muted palette-empty">No matches</li>}
        </ul>
        <div className="palette-foot muted small">↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  )
}
