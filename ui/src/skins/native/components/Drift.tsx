import { type ReactNode, useState } from 'react'
import { type DriftCell, groupLabel } from '../../../core/drift'
import { envTone } from '../../../core/envtone'
import type { DriftState } from '../../../core/hooks/useDrift'
import { EnvDot, KeyText, PaneHead } from './bits'

type Props = {
  titleTabs?: ReactNode
  drift: DriftState
  onSelect: (name: string) => void
}

function Cell({ c }: { c: DriftCell }) {
  if (c.state === 'none') return <span className="muted">·</span>
  if (c.state === 'missing')
    return (
      <span className="bad-text strong" title="this environment doesn't set the key">
        missing
      </span>
    )
  const label = c.empty ? '∅' : groupLabel(c.group)
  const title = c.empty ? 'set, but empty' : `value ${groupLabel(c.group)}: cells with the same letter have the same value`
  return (
    <span className={`drift-chip g${c.group % 6}${c.empty ? ' empty' : ''}`} title={c.quotesOnly ? `${title}; written with different quotes` : title}>
      {label}
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

  return (
    <div className="pane drift-pane">
      <PaneHead
        tabs={titleTabs}
        title={`Drift${service ? ` · ${service}` : ''}`}
        actions={
          <span className="row">
            <label className="small">
              Service{' '}
              <select aria-label="service" value={service ?? ''} onChange={(e) => drift.setService(e.target.value)}>
                <option value="" disabled>
                  pick…
                </option>
                {services.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" disabled={!service || loading} onClick={() => service && drift.run(service)}>
              {loading ? 'Comparing…' : table ? 'Compare again' : 'Compare keys'}
            </button>
          </span>
        }
      />
      <div className="body">
        <div className="muted small" style={{ marginBottom: 8 }}>
          Compares one service's keys across its environments. The core decrypts them and sends back only fingerprints, so no value is shown here: cells with the same letter hold the same
          value, ∅ is empty, ≈ means only the quotes differ.
        </div>
        {error && <div className="bad-text">{error}</div>}
        {!service && services.length === 0 && <div className="muted">No service has two or more environments in this source.</div>}
        {!service && services.length > 0 && <div className="muted">Pick a service, then Compare keys.</div>}
        {table && (
          <>
            <div className="row drift-summary" role="status">
              <span>
                <strong>{table.counts.keys}</strong> keys
              </span>
              <span className="good-text">{table.counts.same} same everywhere</span>
              <span className="warn-text">{table.counts.differs} differ</span>
              <span className={table.counts.missing ? 'bad-text' : 'muted'}>{table.counts.missing} missing somewhere</span>
              {table.counts.warnings > 0 && <span className="badge tone-prod">{table.counts.warnings} prod check{table.counts.warnings === 1 ? '' : 's'}</span>}
              <span className="spacer" />
              <span className="seg" role="tablist" aria-label="rows">
                <button role="tab" aria-selected={only === 'all'} onClick={() => setOnly('all')}>
                  All keys
                </button>
                <button role="tab" aria-selected={only === 'problems'} onClick={() => setOnly('problems')}>
                  Differences
                </button>
              </span>
            </div>
            <div className="tablewrap">
              <table className="matrix drift">
                <thead>
                  <tr>
                    <th>Key</th>
                    {table.columns.map((c) => (
                      <th key={c.env} title={c.problem ? `${c.name ?? c.env}: ${c.problem}` : c.name ?? undefined}>
                        {c.name ? (
                          <button className="th-sort" onClick={() => onSelect(c.name!)}>
                            <EnvDot tone={envTone(c.env)} />
                            {c.env}
                          </button>
                        ) : (
                          <span className="muted">
                            <EnvDot tone={envTone(c.env)} />
                            {c.env}
                          </span>
                        )}
                        {c.problem && <div className="small bad-text drift-problem">{c.problem}</div>}
                      </th>
                    ))}
                    <th>Check</th>
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
                      <td className="small">
                        {r.warnings.map((w) => (
                          <span key={w} className="badge tone-prod" title="prod should rarely share a value with another environment; check it is meant to">
                            {w}
                          </span>
                        ))}
                        {!r.warnings.length && r.kind === 'same' && <span className="muted">same</span>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={table.columns.length + 2} className="muted">
                        No differences.
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
