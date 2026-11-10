import { useState } from 'react'
import { type Diff, summarize } from '../../../core/diff'
import { useSettings } from '../../../core/settings'

const keyOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** Renders a value diff: key view for .env files, line view for anything. */
export function DiffView({ diff }: { diff: Diff }) {
  const [view, setView] = useState<'keys' | 'lines'>('keys')
  const [showSame, setShowSame] = useState(false)
  const { envOrder } = useSettings()

  if (diff.identical) return <div className="muted"># no differences.</div>
  const formattingOnly = diff.sameKeys

  const mode = diff.keys ? view : 'lines'
  const sum = summarize(mode === 'keys' && diff.keys ? diff.keys : diff.lines)
  const same = diff.keys?.filter((k) => k.kind === 'same').length ?? 0

  return (
    <>
      {formattingOnly && (
        <div className="t-function">
          ✓ same keys and values <span className="muted">— the text differs only in comments, order or formatting (see lines).</span>
        </div>
      )}
      {!formattingOnly && diff.sameContent && (
        <div className="t-function">
          ✓ same keys and values{' '}
          <span className="muted">
            — only quoting differs, on {sum.quotesOnly} key{sum.quotesOnly === 1 ? '' : 's'} (≈ rows). dotenv loaders read these the same.
          </span>
        </div>
      )}
      <div className="row" style={{ margin: '4px 0' }}>
        <span className="small">
          <span className="t-function">+{sum.added} added</span> · <span className="t-error">-{sum.removed} removed</span>
          {mode === 'keys' && (
            <>
              {' '}
              · <span className="t-keyword">~{sum.changed - sum.quotesOnly} changed</span>
              {sum.quotesOnly > 0 && (
                <>
                  {' '}
                  · <span className="muted">≈{sum.quotesOnly} quotes only</span>
                </>
              )}
            </>
          )}
        </span>
        {diff.keys && (
          <div className="tabs" role="tablist" aria-label="diff view">
            <button role="tab" aria-selected={mode === 'keys'} onClick={() => setView('keys')}>
              keys
            </button>
            <button role="tab" aria-selected={mode === 'lines'} onClick={() => setView('lines')}>
              lines
            </button>
          </div>
        )}
        {mode === 'keys' && same > 0 && (
          <button className="link" onClick={() => setShowSame(!showSame)}>
            {showSame ? 'hide' : 'show'} {same} unchanged
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
                      <td className="muted">{c.key}</td>
                      <td className="muted">{c.value}</td>
                    </tr>
                  )
                ) : (
                  <tr key={c.key}>
                    <td
                      className={c.kind === 'added' ? 't-function' : c.kind === 'removed' ? 't-error' : c.quotesOnly ? 'muted' : 't-keyword'}
                      title={c.kind === 'changed' && c.quotesOnly ? 'same value, only the quotes differ' : undefined}
                    >
                      {c.kind === 'added' ? '+' : c.kind === 'removed' ? '-' : c.quotesOnly ? '≈' : '~'}
                    </td>
                    <td className="t-keyword">{c.key}</td>
                    <td>
                      {c.kind === 'added' && <span className="t-function">{c.after}</span>}
                      {c.kind === 'removed' && <span className="t-error">{c.before}</span>}
                      {c.kind === 'changed' && !c.quotesOnly && (
                        <>
                          <span className="t-error">{c.before}</span> <span className="muted">→</span>{' '}
                          <span className="t-function">{c.after}</span>
                        </>
                      )}
                      {c.kind === 'changed' && c.quotesOnly && (
                        <span className="muted">
                          {c.before} → {c.after} <span className="t-keyword">quotes only</span>
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
        <pre className="value diff-lines">
          {diff.lines.map((l, i) => (
            <div key={i} className={l.kind === 'add' ? 'add' : l.kind === 'del' ? 'del' : 'same'}>
              {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
              {l.text}
            </div>
          ))}
        </pre>
      )}
    </>
  )
}
