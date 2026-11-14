import { type ReactNode, useState } from 'react'
import { type DriftCell, groupLabel } from '../../../core/drift'
import { envTone } from '../../../core/envtone'
import type { DriftState } from '../../../core/hooks/useDrift'
import { KeyText } from './KeyText'
import { PaneTitle } from './PaneTitle'
import { Select } from './Select'

type Props = {
  titleTabs?: ReactNode
  drift: DriftState
  onSelect: (name: string) => void
}

function Cell({ c }: { c: DriftCell }) {
  if (c.state === 'none') return <span className="muted">·</span>
  if (c.state === 'missing')
    return (
      <span className="t-error" title="this environment doesn't set the key">
        missing
      </span>
    )
  const title = c.empty ? 'set, but empty' : `value ${groupLabel(c.group)}: cells with the same letter have the same value`
  return (
    <span className={`drift-chip g${c.group % 6}${c.empty ? ' empty' : ''}`} title={c.quotesOnly ? `${title}; written with different quotes` : title}>
      {c.empty ? '∅' : groupLabel(c.group)}
      {c.quotesOnly && <span className="muted">≈</span>}
    </span>
  )
}

/**
 * Keys × environments for one service. The core compares fingerprints, so no
 * value reaches this pane: a letter says which cells hold the same value.
 */
export function DriftPane({ titleTabs, drift, onSelect }: Props) {
  const [only, setOnly] = useState<'all' | 'problems'>('all')
  const { services, service, table, loading, error } = drift
  const rows = table ? (only === 'all' ? table.rows : table.rows.filter((r) => r.kind !== 'same' || r.warnings.length)) : []
  // the check column only holds prod warnings, so it shows only when a row in view has one
  const showCheck = rows.some((r) => r.warnings.length > 0)

  return (
    <div className="card pane drift-pane">
      <PaneTitle
        tabs={titleTabs}
        extra={
          <>
            <Select ariaLabel="service" placeholder="pick a service…" value={service ?? ''} options={services.map((s) => ({ value: s, label: s }))} onChange={drift.setService} />
            <button className="primary" disabled={!service || loading} onClick={() => service && drift.run(service)}>
              {loading ? 'comparing…' : table ? 'compare again' : 'compare keys'}
            </button>
          </>
        }
      >
        drift <span className="muted">— {service ?? 'pick a service'}</span>
      </PaneTitle>
      <div className="body">
        <div className="muted small">
          # the core decrypts this service's environments and sends back fingerprints only, so no value is shown: the same letter means the same value, ∅ is empty, ≈ means only the
          quotes differ.
        </div>
        {error && <div className="t-error">{error}</div>}
        {!service && services.length === 0 && <div className="muted"># no service has two or more environments in this source</div>}
        {table && (
          <>
            <div className="row drift-summary" role="status">
              <span>
                <strong>{table.counts.keys}</strong> keys
              </span>
              <span className="t-function">{table.counts.same} same everywhere</span>
              <span className="t-string">{table.counts.differs} differ</span>
              <span className={table.counts.missing ? 't-error' : 'muted'}>{table.counts.missing} missing somewhere</span>
              {table.counts.warnings > 0 && <span className="tone-prod">[{table.counts.warnings} prod check{table.counts.warnings === 1 ? '' : 's'}]</span>}
              <span className="tabs" role="tablist" aria-label="rows">
                <button role="tab" aria-selected={only === 'all'} onClick={() => setOnly('all')}>
                  all keys
                </button>
                <button role="tab" aria-selected={only === 'problems'} onClick={() => setOnly('problems')}>
                  differences
                </button>
              </span>
            </div>
            <div className="tablewrap">
              <table className="matrix drift">
                <thead>
                  <tr>
                    <th>key</th>
                    {table.columns.map((c) => (
                      <th key={c.env} title={c.problem ? `${c.name ?? c.env}: ${c.problem}` : c.name ?? undefined}>
                        {c.name ? (
                          <button className="th-sort" onClick={() => onSelect(c.name!)}>
                            <span className={envTone(c.env) ? `tone-${envTone(c.env)}` : undefined}>{c.env}</span>
                          </button>
                        ) : (
                          <span className="muted">{c.env}</span>
                        )}
                        {c.problem && <div className="small t-error drift-problem">{c.problem}</div>}
                      </th>
                    ))}
                    {showCheck && <th>check</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={`drift-${r.kind}`}>
                      <td className="env-key">
                        <KeyText k={r.key} />
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i}>
                          <Cell c={c} />
                        </td>
                      ))}
                      {showCheck && (
                      <td className="small">
                        {r.warnings.map((w) => (
                          <span key={w} className="tone-prod drift-warn" title="prod should rarely share a value with another environment; check it is meant to">
                            [{w}]
                          </span>
                        ))}
                      </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={table.columns.length + (showCheck ? 2 : 1)} className="muted">
                        # no differences
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
