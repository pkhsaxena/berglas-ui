import type { ReactNode, Ref as ReactRef } from 'react'
import { versionOf } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import type { SecretListState } from '../../../core/hooks/useSecretList'
import { readOnlyFor, useSettings, useStamp } from '../../../core/settings'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'
import { EnvDot, ErrorText, PaneHead } from './bits'

type Props = {
  ref?: ReactRef<HTMLInputElement>
  source: Source
  list: SecretListState
  selected: string | null
  onSelect: (name: string) => void
  /** shows a New button when set */
  onCreate?: () => void
  /** favourites and recents, shown above the list while no filter is typed */
  quick?: ReactNode
}

export function SecretList({ ref, source, list, selected, onSelect, onCreate, quick }: Props) {
  const { secrets, shown, groups, loading, error, filter, setFilter, refresh } = list
  const readOnly = readOnlyFor(useSettings(), source)
  const stamp = useStamp()

  return (
    <div className="pane list-pane">
      <PaneHead
        title={secrets ? `Secrets · ${filter.trim() ? `${shown.length} of ${secrets.length}` : secrets.length}` : 'Secrets'}
        actions={
          <>
            <button className="icon-btn" onClick={refresh} disabled={loading} aria-label="refresh" title="Refresh">
              {loading ? '…' : '↻'}
            </button>
            {onCreate && !readOnly && (
              <button className="icon-btn" onClick={onCreate} aria-label="new secret" title="New secret">
                +
              </button>
            )}
          </>
        }
      />
      <div style={{ padding: '0 8px 6px' }}>
        <input ref={ref} type="search" aria-label="filter secrets" placeholder="Filter  /" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} autoComplete="off" style={{ width: '100%' }} />
        {readOnly && <div className="muted small" style={{ marginTop: 4 }}>Read-only by config</div>}
      </div>
      {error ? (
        <div style={{ padding: '0 8px' }}>
          <ErrorText>Couldn't list secrets — {error}</ErrorText>
        </div>
      ) : secrets === null ? (
        <div className="muted" style={{ padding: '0 8px' }}>
          Listing…
        </div>
      ) : secrets.length === 0 ? (
        <div className="muted small" style={{ padding: '0 8px' }}>
          No berglas secrets here. Nothing in this {source.backend === 'storage' ? 'bucket' : 'project'} is marked as one.
        </div>
      ) : shown.length === 0 ? (
        <div className="muted small" style={{ padding: '0 8px' }}>
          No names match “{filter}”.
        </div>
      ) : (
        <div className="scroll" role="status" aria-label={`${shown.length} of ${secrets.length} secrets`}>
          {!filter.trim() && quick}
          {groups.map((g) => (
            <div key={g.key ?? '\u0000other'}>
              {source.group && (
                <div className="group-key">
                  {g.key === null ? <span className="muted">Other</span> : g.key}
                  <span className="count">{g.items.length}</span>
                </div>
              )}
              <ul className={source.group ? 'clean grouped' : 'clean'}>
                {g.items.map(({ item: s, label }) => (
                  <li key={s.name}>
                    <button className="rowbtn secret" title={s.name} aria-label={s.name} aria-current={s.name === selected ? 'true' : undefined} onClick={() => onSelect(s.name)}>
                      <span className="line">
                        <EnvDot tone={toneOfSecret(s.name, source.group)} />
                        <span className="nm">{label}</span>
                      </span>
                      <span className="meta" title={stamp(s.updatedAt)}>
                        #{versionOf(s)} · {ago(s.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
