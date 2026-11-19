import { useEffect, useRef } from 'react'
import { toneOfSecret } from '../../../core/envtone'
import type { DropChoice } from '../../../core/droptarget'
import type { DropPicker } from '../../../core/hooks/useDropPicker'
import { modKey } from '../../../core/shortcuts'
import type { FileDropState } from '../../../core/hooks/useFileDrop'
import { EnvDot } from './bits'

type Props = {
  drop: FileDropState
  picker: DropPicker
  /** the open source's name, and its group pattern for the environment colours */
  sourceName: string
  group?: string
  writable: boolean
}

const size = (n: number) => (n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`)

/**
 * While dragging a file: a drop hint. After a drop: search the open source
 * for the secret to replace, or start a new one. Either opens on the review
 * screen; nothing is written from here.
 */
export function FileDrop({ drop, picker: p, sourceName, group, writable }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [p.index, p.choices])

  // one choice; the new secret's row is pinned under the search box, the secrets scroll below it
  const row = (c: DropChoice, i: number) => {
    return (
      <li
        key={`${c.kind}:${c.name}`}
        id={`drop-${i}`}
        role="option"
        aria-selected={i === p.index}
        className={`palette-item${c.kind === 'create' ? ' drop-create' : ''}`}
        onMouseMove={() => i !== p.index && p.setIndex(i)}
        onClick={() => p.choose(c)}
      >
        {c.kind === 'replace' ? (
          <>
            <EnvDot tone={toneOfSecret(c.name, group)} />
            <span className="mono">{c.name}</span>
            <span className="drop-row-end">
              {c.open && <span className="muted small">open</span>}
              {/* opens the review screen (the row does the same); nothing is written from here */}
              <button className="btn small-btn" tabIndex={-1}>
                Review changes
              </button>
            </span>
          </>
        ) : (
          <>
            <span>+</span>
            <span>{c.name ? <>New secret <span className="mono">{c.name}</span></> : 'New secret…'}</span>
            <span className="drop-row-end">
              <button className="btn small-btn" tabIndex={-1}>
                Review new secret
              </button>
            </span>
          </>
        )}
      </li>
    )
  }
  const off = p.hasCreate ? 1 : 0

  if (drop.dragging)
    return (
      <div className="drop-overlay" data-find-ignore>
        <div className="drop-hint">
          <strong>Drop a file to use it as a secret value</strong>
          <span className="muted">Nothing is saved until you review it.</span>
        </div>
      </div>
    )
  const f = drop.dropped
  if (!f && !drop.error) return null
  return (
    <div className="palette-backdrop dialog-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && drop.clear()}>
      <div className="drop-dialog" role="dialog" aria-label="dropped file">
        {f ? (
          <>
            <h3 className="mono">{f.name}</h3>
            <div className="muted small">{f.keys !== null ? `.env file · ${f.keys} keys · ${size(f.size)}` : `text · ${size(f.size)}`}</div>
            {writable ? (
              <>
                <div className="small">Write it to which secret in {sourceName}?</div>
                <input
                  ref={p.inputRef}
                  type="search"
                  aria-label="search secrets for the dropped file"
                  placeholder="Search secrets, or type a new name…"
                  value={p.query}
                  onChange={(e) => p.setQuery(e.target.value)}
                  onKeyDown={p.onKeyDown}
                  aria-controls="drop-choices"
                  aria-activedescendant={p.choices[p.index] ? `drop-${p.index}` : undefined}
                  spellCheck={false}
                  autoComplete="off"
                />
                {p.hasCreate ? (
                  <ul role="listbox" aria-label="new secret" className="palette-list drop-new">
                    {row(p.choices[0], 0)}
                  </ul>
                ) : (
                  p.problem && <div className="drop-new warn-text small">Can't create “{p.query.trim()}”: {p.problem}</div>
                )}
                <ul id="drop-choices" ref={listRef} role="listbox" className="palette-list drop-choices">
                  {p.choices.slice(off).map((c, j) => row(c, j + off))}
                  {p.choices.length === off && <li className="muted palette-empty">No matches</li>}
                </ul>
                <div className="muted small">↑↓ to move · Enter to choose · {modKey()}Enter for a new secret · Esc to cancel. The next screen shows the change for review; nothing is written until you save it.</div>
              </>
            ) : (
              <div className="warn-text small">This source is read-only, so a file can't be used here.</div>
            )}
            <div className="drop-actions">
              <button className="btn" onClick={drop.clear}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bad-text">{drop.error}</div>
            <div className="drop-actions">
              <button className="btn" onClick={drop.clear} autoFocus>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
