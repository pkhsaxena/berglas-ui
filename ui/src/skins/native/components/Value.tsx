import { useState } from 'react'
import { type KeyChange, matchAgainst } from '../../../core/diff'
import { envLines, exportLines } from '../../../core/envcopy'
import { matchesQuery } from '../../../core/envfilter'
import type { Pinned } from '../../../core/hooks/usePinned'
import type { Revealed } from '../../../core/hooks/useSecret'
import { useSettings } from '../../../core/settings'
import { EnvPair, KeyText } from './bits'
import { EnvRows, OrderToggle } from './EnvRows'

// how one revealed key compares with the pinned secret
function pinMark(c: KeyChange | undefined) {
  if (!c) return null
  if (c.kind === 'same') return <span className="good-text" title="same as pinned">= same</span>
  if (c.kind === 'removed') return <span className="muted" title="not in the pinned secret">+ only here</span>
  if (c.kind === 'changed' && c.quotesOnly)
    return (
      <span className="muted" title={`same value, only the quotes differ (pinned: ${c.after})`}>
        ≈ quotes
      </span>
    )
  if (c.kind === 'changed')
    return (
      <span className="warn-text" title={`pinned: ${c.after}`}>
        ≠ differs
      </span>
    )
  return null
}

const MASK = '••••••••••••'

type Props = {
  value: Revealed | null
  onCopy: (text: string) => void
  /** pinned values do not hide on a timer */
  persistent?: boolean
  /** a pinned .env secret to mark each key against */
  against?: Pinned | null
}

/** A secret value: masked, binary notice, key table or raw text. */
export function Value({ value, onCopy, persistent = false, against = null }: Props) {
  const [view, setView] = useState<'env' | 'raw'>('env')
  const [query, setQuery] = useState('')
  /** keys left out of the last export copy (a shell cannot name them) */
  const [skipped, setSkipped] = useState<string[]>([])
  const { revealSeconds, envOrder } = useSettings()

  if (!value) {
    return (
      <div className="masked" aria-label="value hidden">
        {MASK}
      </div>
    )
  }
  if (value.text === null) return <div className="muted">Binary value · {value.size} bytes — not shown as text.</div>

  const env = value.env
  const mode = env ? view : 'raw'
  const vs = env && against?.value?.env && against.value.text !== null ? matchAgainst(value.text, against.value.text) : null
  const pinName = against?.ref.name
  const pairs = env ? env.filter((l): l is Extract<typeof l, { kind: 'pair' }> => l.kind === 'pair') : []
  const filtering = query.trim() !== ''
  const shown = filtering ? pairs.filter((p) => matchesQuery(p.key, p.value, query)) : pairs
  const shownCount = shown.length
  // export lines cover what the table shows: every key, or the filtered ones
  const copyExport = () => {
    const r = exportLines(shown)
    setSkipped(r.skipped)
    if (r.text) onCopy(r.text)
  }

  return (
    <div style={{ marginTop: 12 }}>
      {env && (
        <div className="row" style={{ marginTop: 0 }}>
          <div className="seg" role="tablist" aria-label="value view">
            <button role="tab" aria-selected={mode === 'env'} onClick={() => setView('env')}>
              Keys
            </button>
            <button role="tab" aria-selected={mode === 'raw'} onClick={() => setView('raw')}>
              Raw
            </button>
          </div>
          {mode === 'env' && <OrderToggle />}
          {mode === 'env' && (
            <input
              className="env-filter"
              type="search"
              placeholder="Filter keys and values"
              aria-label="filter keys and values"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''))}
            />
          )}
          {mode === 'env' && filtering && (
            <span className="muted small">
              {shownCount} of {pairs.length} key{pairs.length === 1 ? '' : 's'}
            </span>
          )}
          {mode === 'env' && <span className="spacer" />}
          {mode === 'env' && filtering && shownCount > 0 && (
            <button className="link small" onClick={() => onCopy(envLines(shown))} title="Copy the shown keys as KEY=value lines">
              Copy {shownCount} shown
            </button>
          )}
          {mode === 'env' && shownCount > 0 && (
            <button className="link small" onClick={copyExport} title={`Copy ${filtering ? 'the shown keys' : 'every key'} as export KEY='value' lines for a shell`}>
              Copy as export lines
            </button>
          )}
        </div>
      )}
      {mode === 'env' && skipped.length > 0 && (
        <div className="warn-text small" style={{ marginBottom: 6 }}>
          Left out of the export lines: {skipped.join(', ')} (a shell can't name keys with a dot or a dash).
        </div>
      )}
      {mode === 'env' && env && vs && (
        <div className={vs.matches || vs.matchesUnquoted ? 'good-text' : 'muted small'} style={{ marginBottom: 8 }}>
          {vs.matches
            ? `✓ Matches pinned ${pinName} exactly`
            : vs.matchesUnquoted
              ? `✓ Matches pinned ${pinName} apart from quoting on ${vs.quotesOnly} key${vs.quotesOnly === 1 ? '' : 's'} (≈)`
              : `Compared with pinned ${pinName}: ${vs.differ - vs.quotesOnly} differ${vs.quotesOnly ? ` · ${vs.quotesOnly} only by quotes` : ''} · ${vs.missing.length} missing · ${vs.extra} only here`}
        </div>
      )}
      {mode === 'env' && env ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                {vs && <th title={`compared with pinned ${pinName}`}>vs pinned</th>}
                <th>
                  <span style={{ position: 'absolute', left: -9999 }}>Copy</span>
                </th>
              </tr>
            </thead>
            <EnvRows
              text={value.text}
              order={envOrder}
              cols={vs ? 4 : 3}
              match={filtering ? (l) => matchesQuery(l.key, l.value, query) : undefined}
              renderPair={(l, i) => (
                <tr key={i}>
                  <td className="env-key">
                    <KeyText k={l.key} />
                  </td>
                  <td className="env-val">{l.value}</td>
                  {vs && <td className="marks">{pinMark(vs.byKey.get(l.key))}</td>}
                  <td>
                    <button className="link" onClick={() => onCopy(`${l.key}=${l.value}`)} aria-label={`copy ${l.key}`} title={`Copy ${l.key}=… (the key and its value)`}>
                      Copy
                    </button>
                  </td>
                </tr>
              )}
            />
          </table>
          {filtering && shownCount === 0 && <div className="muted" style={{ padding: '8px 10px' }}>No key or value contains “{query.trim()}”.</div>}
        </div>
      ) : (
        <pre className="value">{value.text}</pre>
      )}
      {mode === 'env' && vs && vs.missing.some((m) => matchesQuery(m.key, m.value, query)) && (
        <div className="section">
          <h3>Only in pinned {pinName}</h3>
          <ul className="clean">
            {vs.missing
              .filter((m) => matchesQuery(m.key, m.value, query))
              .map((m) => (
                <li key={m.key}>
                  <EnvPair k={m.key} v={m.value} />
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="muted small" style={{ marginTop: 8 }}>
        {value.size} bytes · {persistent ? 'shown until unpinned.' : revealSeconds > 0 ? `hides again after ${revealSeconds}s or Esc.` : 'Esc hides it.'}
      </div>
    </div>
  )
}
