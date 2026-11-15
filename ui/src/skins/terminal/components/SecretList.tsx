import type { ReactNode, Ref as ReactRef } from 'react'
import { versionOf } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import type { SecretListState } from '../../../core/hooks/useSecretList'
import { readOnlyFor, useSettings, useStamp } from '../../../core/settings'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'

type Props = {
  ref?: ReactRef<HTMLInputElement>
  source: Source
  list: SecretListState
  selected: string | null
  onSelect: (name: string) => void
  /** shows a "new secret" button when set */
  onCreate?: () => void
  /** favourites and recents, shown above the list while no filter is typed */
  quick?: ReactNode
}

export function SecretList({ ref, source, list, selected, onSelect, onCreate, quick }: Props) {
  const { secrets, shown, groups, loading, error, filter, setFilter, refresh } = list
  const scheme = source.backend === 'storage' ? 'berglas://' : 'sm://'
  const readOnly = readOnlyFor(useSettings(), source)
  const stamp = useStamp()

  return (
    <div className="card list-pane">
      <h2>
        secrets{' '}
        <span className="muted">
          — {source.label || `${scheme}${source.parent}`}
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
        {onCreate && !readOnly && <button onClick={onCreate}>new</button>}
      </div>
      <div className="muted small"># press / to filter{readOnly && ' · read-only by config'}</div>

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
            <div className="scroll">
              {!filter.trim() && quick}
              {groups.map((g) => (
                <div key={g.key ?? '\u0000other'}>
                  {source.group && (
                    <div className="group-key">
                      {g.key === null ? <span className="muted"># other</span> : <span className="t-keyword">{g.key}/</span>}
                    </div>
                  )}
                  <ul className={source.group ? 'clean grouped' : 'clean'}>
                    {g.items.map(({ item: s, label }) => {
                      const tone = toneOfSecret(s.name, source.group)
                      return (
                      <li key={s.name} style={{ padding: 0 }}>
                        <button
                          className="rowbtn secret"
                          title={s.name}
                          aria-label={s.name}
                          aria-current={s.name === selected ? 'true' : undefined}
                          onClick={() => onSelect(s.name)}
                        >
                          <span className={tone ? `nm tone-${tone}` : 'nm'}>{label}</span>
                          <span className="meta">
                            <span className="ver">#{versionOf(s)} · </span>
                            updated <span className="when">{stamp(s.updatedAt)} · </span>
                            {ago(s.updatedAt)}
                          </span>
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
