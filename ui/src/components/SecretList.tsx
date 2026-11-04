import { forwardRef, useMemo, useState } from 'react'
import type { Secret } from '../api'
import type { Source } from '../sources'
import { ago } from '../time'

type Props = {
  source: Source
  secrets: Secret[] | null
  loading: boolean
  error: string
  selected: string | null
  onSelect: (name: string) => void
  onRefresh: () => void
}

export const SecretList = forwardRef<HTMLInputElement, Props>(function SecretList(
  { source, secrets, loading, error, selected, onSelect, onRefresh },
  filterRef,
) {
  const [filter, setFilter] = useState('')
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (secrets ?? []).filter((s) => s.name.toLowerCase().includes(f)).sort((a, b) => a.name.localeCompare(b.name))
  }, [secrets, filter])

  const scheme = source.backend === 'storage' ? 'berglas://' : 'sm://'

  return (
    <div className="card list-pane">
      <h2>
        secrets{' '}
        <span className="muted">
          — {scheme}
          {source.parent}
        </span>
      </h2>
      <div className="term-ln">
        <span className="t-prompt">$</span> <span className="t-function">ls</span>{' '}
        <span className="t-string">
          {scheme}
          {source.parent}
        </span>
      </div>
      <div className="row">
        <input
          ref={filterRef}
          aria-label="filter secrets"
          placeholder="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button onClick={onRefresh} disabled={loading}>
          {loading ? 'loading…' : 'refresh'}
        </button>
      </div>
      <div className="muted small"># press / to filter</div>

      {error ? (
        <div role="alert" className="t-error">
          error: {error}
        </div>
      ) : secrets === null ? (
        <div className="muted"># listing…</div>
      ) : secrets.length === 0 ? (
        <div className="muted"># no berglas secrets here. nothing in this {source.backend === 'storage' ? 'bucket' : 'project'} is marked as one.</div>
      ) : (
        <>
          <div className="muted small" role="status">
            # <span className="t-number">{shown.length}</span> of <span className="t-number">{secrets.length}</span>
          </div>
          {shown.length === 0 ? (
            <div className="muted"># no names match “{filter}”.</div>
          ) : (
            <ul className="clean scroll">
              {shown.map((s) => (
                <li key={s.name} style={{ padding: 0 }}>
                  <button className="rowbtn" aria-current={s.name === selected ? 'true' : undefined} onClick={() => onSelect(s.name)}>
                    {s.name}
                    <span className="meta">updated {ago(s.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
})
