import type { Ref as ReactRef } from 'react'
import { useSecretList } from '../../../core/hooks/useSecretList'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'

type Props = {
  ref?: ReactRef<HTMLInputElement>
  source: Source
  selected: string | null
  onSelect: (name: string) => void
}

export function SecretList({ ref, source, selected, onSelect }: Props) {
  const { secrets, shown, loading, error, filter, setFilter, refresh } = useSecretList(source, true)
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
          ref={ref}
          aria-label="filter secrets"
          placeholder="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button onClick={refresh} disabled={loading}>
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
}
