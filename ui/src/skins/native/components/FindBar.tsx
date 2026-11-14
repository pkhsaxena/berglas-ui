import type { FindState } from '../../../core/hooks/useFind'

/** The find bar (desktop app, Edit → Find). Enter / ⇧Enter step, Esc closes. */
export function FindBar({ f }: { f: FindState }) {
  const { open, query, setQuery, count, index, next, prev, close, inputRef } = f
  if (!open) return null
  return (
    <div className="find-bar" role="search" data-find-ignore>
      <input
        ref={inputRef}
        type="search"
        aria-label="find in page"
        placeholder="Find in page"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) prev()
            else next()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
      />
      <span className="muted small find-count">{query ? (count ? `${index + 1} of ${count}` : 'No matches') : ''}</span>
      <button className="icon-btn" onClick={prev} disabled={!count} aria-label="previous match" title="Previous (⇧Enter, ⇧⌘G)">
        ↑
      </button>
      <button className="icon-btn" onClick={next} disabled={!count} aria-label="next match" title="Next (Enter, ⌘G)">
        ↓
      </button>
      <button className="icon-btn" onClick={close} aria-label="close find" title="Close (Esc)">
        ✕
      </button>
    </div>
  )
}
