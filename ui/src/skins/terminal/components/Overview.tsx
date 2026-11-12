import { type ReactNode, useMemo } from 'react'
import { type Secret, versionOf } from '../../../core/api'
import type { SecretListState } from '../../../core/hooks/useSecretList'
import { type Matrix, overview, type SortDir, sortMatrixRows, STALE_DAYS } from '../../../core/overview'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'
import { PaneTitle } from './PaneTitle'

type OverviewProps = {
  /** view tabs, when this is the top pane of the right column */
  titleTabs?: ReactNode
  /** zoomed-out tabs, when shown in the versions column while comparing */
  wideTabs?: ReactNode
  source: Source
  list: SecretListState
  onSelect: (name: string) => void
}

/** Facts about the open source, from list metadata only; nothing is decrypted. */
export function OverviewPane({ source, list, onSelect, titleTabs, wideTabs }: OverviewProps) {
  const o = useMemo(() => (list.secrets ? overview(list.secrets, source.group) : null), [list.secrets, source.group])
  const scheme = source.backend === 'storage' ? 'berglas://' : 'sm://'

  const link = (s: Secret) => (
    <button className="link" onClick={() => onSelect(s.name)} title={`${s.name} #${versionOf(s)}`}>
      {s.name}
    </button>
  )

  return (
    <div className="card pane overview-pane">
      <PaneTitle tabs={titleTabs} wideTabs={wideTabs}>
        overview <span className="muted">— {source.label || source.parent}</span>
      </PaneTitle>
      <div className="body">
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">stat</span>{' '}
          <span className="t-string">
            {scheme}
            {source.parent}
          </span>
        </div>
        <div className="muted small"># pick a secret to see its metadata and versions. values stay hidden until you reveal them.</div>
        {!o ? (
          <div className="muted"># listing…</div>
        ) : (
          <>
            <div className="kv">
              <span className="label">secrets</span>
              <span>{o.count}</span>
            </div>
            <div className="kv">
              <span className="label">changed</span>
              <span>
                {o.changed7d} <span className="muted">in 7d ·</span> {o.changed30d} <span className="muted">in 30d</span>
              </span>
            </div>
            {o.newest && (
              <div className="kv">
                <span className="label">latest change</span>
                <span className="str">
                  {link(o.newest)} <span className="muted">· {ago(o.newest.updatedAt)}</span>
                </span>
              </div>
            )}
            <div className="kv">
              <span className="label">stale</span>
              <span>
                {o.stale.length} <span className="muted">untouched for {STALE_DAYS}d+</span>
              </span>
            </div>
            {o.kmsKeys.length > 0 && (
              <div className="kv">
                <span className="label">kms keys</span>
                <span className="str">{o.kmsKeys.length === 1 ? o.kmsKeys[0].key.split('/').slice(-3).join('/') : `${o.kmsKeys.length} different keys`}</span>
              </div>
            )}

            <div className="t-keyword" style={{ marginTop: 8 }}>
              recently changed
            </div>
            <ul className="clean">
              {o.recent.map((s) => (
                <li key={s.name} className="kv">
                  <span>{link(s)}</span>
                  <span className="muted">{ago(s.updatedAt)}</span>
                </li>
              ))}
            </ul>

            {o.stale.length > 0 && (
              <>
                <div className="t-keyword" style={{ marginTop: 8 }}>
                  untouched longest
                </div>
                <ul className="clean">
                  {o.stale.slice(0, 5).map((s) => (
                    <li key={s.name} className="kv">
                      <span>{link(s)}</span>
                      <span className="t-error">{ago(s.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export type MatrixSort = { col: string; dir: SortDir } | null

type MatrixProps = {
  /** view tabs, when this is the top pane of the right column */
  titleTabs?: ReactNode
  /** zoomed-out tabs, when shown in the versions column while comparing */
  wideTabs?: ReactNode
  source: Source
  matrix: Matrix
  selected: string | null
  onSelect: (name: string) => void
  /** rows ordered by one column, or null for the default service order */
  sort: MatrixSort
  onSort: (s: MatrixSort) => void
  className?: string
}

// a column header click cycles: default → ascending → descending → default
const nextSort = (cur: MatrixSort, col: string): MatrixSort =>
  cur?.col !== col ? { col, dir: 'asc' } : cur.dir === 'asc' ? { col, dir: 'desc' } : null

/** The {first} × {second} placeholder grid, e.g. service × env; a cell opens that secret. */
export function MatrixPane({ source, matrix: unsorted, selected, onSelect, sort, onSort, className = '', titleTabs, wideTabs }: MatrixProps) {
  const matrix = sortMatrixRows(unsorted, sort?.col ?? null, sort?.dir ?? 'asc')
  return (
    <div className={`card pane matrix-pane ${className}`}>
      <PaneTitle tabs={titleTabs} wideTabs={wideTabs}>
        matrix <span className="muted">— {source.group}</span>
      </PaneTitle>
      <div className="body">
        <div className="muted small">
          # cells show time since the last change; – means no such secret. click an env to sort: newest first, oldest first, back to default.
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
                      {c}
                      <span className="t-prompt">{sort?.col === c ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r) => (
                <tr key={r.key} className={r.cells.some((c) => c?.name === selected) ? 'active' : undefined}>
                  <td className="t-keyword">{r.key}</td>
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
