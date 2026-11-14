import { useState } from 'react'
import { type Diff, summarize } from '../../../core/diff'
import { useSettings } from '../../../core/settings'
import { KeyText } from './bits'

const keyOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** A value diff: a key view for .env files, a line view for anything. */
export function DiffView({ diff }: { diff: Diff }) {
  const [view, setView] = useState<'keys' | 'lines'>('keys')
  const [showSame, setShowSame] = useState(false)
  const { envOrder } = useSettings()

  if (diff.identical) return <div className="muted">No differences.</div>
  const formattingOnly = diff.sameKeys
  const mode = diff.keys ? view : 'lines'
  const sum = summarize(mode === 'keys' && diff.keys ? diff.keys : diff.lines)
  const same = diff.keys?.filter((k) => k.kind === 'same').length ?? 0

  return (
    <>
      {formattingOnly && (
        <div className="good-text">
          ✓ Same keys and values <span className="muted">— the text differs only in comments, order or formatting (see Lines).</span>
        </div>
      )}
      {!formattingOnly && diff.sameContent && (
        <div className="good-text">
          ✓ Same keys and values{' '}
          <span className="muted">
            — only quoting differs, on {sum.quotesOnly} key{sum.quotesOnly === 1 ? '' : 's'} (≈ rows). Dotenv loaders read these the same.
          </span>
        </div>
      )}
      <div className="row">
        <span className="small">
          <span className="good-text">+{sum.added} added</span> · <span className="bad-text">−{sum.removed} removed</span>
          {mode === 'keys' && (
            <>
              {' '}
              · <span className="warn-text">~{sum.changed - sum.quotesOnly} changed</span>
              {sum.quotesOnly > 0 && <span className="muted"> · ≈{sum.quotesOnly} quotes only</span>}
            </>
          )}
        </span>
        {diff.keys && (
          <div className="seg" role="tablist" aria-label="diff view">
            <button role="tab" aria-selected={mode === 'keys'} onClick={() => setView('keys')}>
              Keys
            </button>
            <button role="tab" aria-selected={mode === 'lines'} onClick={() => setView('lines')}>
              Lines
            </button>
          </div>
        )}
        {mode === 'keys' && same > 0 && (
          <button className="link" onClick={() => setShowSame(!showSame)}>
            {showSame ? 'Hide' : 'Show'} {same} unchanged
          </button>
        )}
      </div>
      {mode === 'keys' && diff.keys ? (
        <div className="tablewrap">
          <table className="diff">
            <tbody>
              {(envOrder === 'sorted' ? [...diff.keys].sort((a, b) => keyOrder.compare(a.key, b.key)) : diff.keys).map((c) =>
                c.kind === 'same' ? (
                  showSame && (
                    <tr key={c.key}>
                      <td className="muted"> </td>
                      <td className="env-key muted">
                        <KeyText k={c.key} />
                      </td>
                      <td className="env-val muted">{c.value}</td>
                    </tr>
                  )
                ) : (
                  <tr key={c.key}>
                    <td
                      className={c.kind === 'added' ? 'good-text' : c.kind === 'removed' ? 'bad-text' : c.quotesOnly ? 'muted' : 'warn-text'}
                      title={c.kind === 'changed' && c.quotesOnly ? 'same value, only the quotes differ' : undefined}
                    >
                      {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : c.quotesOnly ? '≈' : '~'}
                    </td>
                    <td className="env-key">
                      <KeyText k={c.key} />
                    </td>
                    <td className="env-val">
                      {c.kind === 'added' && <span className="good-text">{c.after}</span>}
                      {c.kind === 'removed' && <span className="bad-text">{c.before}</span>}
                      {c.kind === 'changed' && !c.quotesOnly && (
                        <>
                          <span className="bad-text">{c.before}</span> <span className="muted">→</span> <span className="good-text">{c.after}</span>
                        </>
                      )}
                      {c.kind === 'changed' && c.quotesOnly && (
                        <span className="muted">
                          {c.before} → {c.after} <span className="warn-text">quotes only</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="diff-lines">
          {diff.lines.map((l, i) => (
            <div key={i} className={l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : 'same'}>
              {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}
              {l.text}
            </div>
          ))}
        </pre>
      )}
    </>
  )
}
