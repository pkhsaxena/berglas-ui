import { type ReactNode, useMemo } from 'react'
import { type Secret, versionOf } from '../../../core/api'
import { envTone } from '../../../core/envtone'
import type { SecretListState } from '../../../core/hooks/useSecretList'
import { type Matrix, overview, type SortDir, sortMatrixRows, STALE_DAYS } from '../../../core/overview'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'
import { EnvDot, PaneHead } from './bits'

type OverviewProps = {
  titleTabs?: ReactNode
  wideTabs?: ReactNode
  source: Source
  list: SecretListState
  onSelect: (name: string) => void
}

/** Facts about the open source, from list metadata only; nothing is decrypted. */
export function OverviewPane({ source, list, onSelect, titleTabs, wideTabs }: OverviewProps) {
  const o = useMemo(() => (list.secrets ? overview(list.secrets, source.group) : null), [list.secrets, source.group])
  const link = (s: Secret) => (
    <button className="link" onClick={() => onSelect(s.name)} title={`${s.name} #${versionOf(s)}`}>
      {s.name}
    </button>
  )

  return (
    <div className="pane overview-pane">
      <PaneHead tabs={titleTabs} wideTabs={wideTabs} title={`Overview · ${source.label || source.parent}`} />
      <div className="body">
        <div className="muted small" style={{ marginBottom: 8 }}>
          Pick a secret to see its details and versions. Values stay hidden until you reveal them.
        </div>
        {!o ? (
          <div className="muted">Listing…</div>
        ) : (
          <>
            <div className="kv">
              <span>Secrets</span>
              <span>{o.count}</span>
            </div>
            <div className="kv">
              <span>Changed</span>
              <span>
                {o.changed7d} <span className="muted">in 7 days ·</span> {o.changed30d} <span className="muted">in 30 days</span>
              </span>
            </div>
            {o.newest && (
              <div className="kv">
                <span>Latest change</span>
                <span>
                  {link(o.newest)} <span className="muted">· {ago(o.newest.updatedAt)}</span>
                </span>
              </div>
            )}
            <div className="kv">
              <span>Stale</span>
              <span>
                {o.stale.length} <span className="muted">untouched for {STALE_DAYS}+ days</span>
              </span>
            </div>
            {o.kmsKeys.length > 0 && (
              <div className="kv">
                <span>KMS keys</span>
                <span className="mono small">{o.kmsKeys.length === 1 ? o.kmsKeys[0].key.split('/').slice(-3).join('/') : `${o.kmsKeys.length} different keys`}</span>
              </div>
            )}
            <div className="section">
              <h3>Recently changed</h3>
              <ul className="clean">
                {o.recent.map((s) => (
                  <li key={s.name} className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span>{link(s)}</span>
                    <span className="muted">{ago(s.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {o.stale.length > 0 && (
              <div className="section">
                <h3>Untouched longest</h3>
                <ul className="clean">
                  {o.stale.slice(0, 5).map((s) => (
                    <li key={s.name} className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
                      <span>{link(s)}</span>
                      <span className="bad-text">{ago(s.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export type MatrixSort = { col: string; dir: SortDir } | null

type MatrixProps = {
  titleTabs?: ReactNode
  wideTabs?: ReactNode
  source: Source
  matrix: Matrix
  selected: string | null
  onSelect: (name: string) => void
  sort: MatrixSort
  onSort: (s: MatrixSort) => void
  /** compare a service's keys across its environments (rows with 2+ environments) */
  onDrift?: (service: string) => void
}

// a column header click cycles: default → ascending → descending → default
const nextSort = (cur: MatrixSort, col: string): MatrixSort => (cur?.col !== col ? { col, dir: 'asc' } : cur.dir === 'asc' ? { col, dir: 'desc' } : null)

/** The {first} × {second} grid from the group pattern, e.g. service × env; a cell opens that secret. */
export function MatrixPane({ source, matrix: unsorted, selected, onSelect, sort, onSort, onDrift, titleTabs, wideTabs }: MatrixProps) {
  const matrix = sortMatrixRows(unsorted, sort?.col ?? null, sort?.dir ?? 'asc')
  return (
    <div className="pane matrix-pane">
      <PaneHead tabs={titleTabs} wideTabs={wideTabs} title={`Matrix · ${source.group}`} />
      <div className="body">
        <div className="muted small" style={{ marginBottom: 8 }}>
          Cells show the time since the last change; – means no such secret. Click an environment to sort: newest first, oldest first, back to default. Click a service to compare its keys across environments.
        </div>
        <div className="tablewrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                {matrix.cols.map((c) => (
                  <th key={c} aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      className="th-sort"
                      onClick={() => onSort(nextSort(sort, c))}
                      title={sort?.col !== c ? `sort by ${c}: newest first` : sort.dir === 'asc' ? `sort by ${c}: oldest first` : 'back to the default order'}
                    >
                      <EnvDot tone={envTone(c)} />
                      {c}
                      <span className="accent-text">{sort?.col === c ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r) => (
                <tr key={r.key} className={r.cells.some((c) => c?.name === selected) ? 'active' : undefined}>
                  <td className="strong">
                    {onDrift && r.cells.filter(Boolean).length >= 2 ? (
                      <button className="link strong" onClick={() => onDrift(r.key)} title={`compare the keys of ${r.key} across environments`}>
                        {r.key}
                      </button>
                    ) : (
                      r.key
                    )}
                  </td>
                  {r.cells.map((c, i) =>
                    c ? (
                      <td key={i}>
                        <button className="link" aria-current={c.name === selected ? 'true' : undefined} onClick={() => onSelect(c.name)} title={c.name}>
                          {ago(c.updatedAt).replace(' ago', '')}
                        </button>
                      </td>
                    ) : (
                      <td key={i} className="muted">
                        –
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
