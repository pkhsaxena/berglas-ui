import { useState } from 'react'
import { HIDE_AFTER_MS, type Revealed } from '../../../core/hooks/useSecret'

const MASK = '••••••••••••'

type Props = {
  value: Revealed | null
  onCopy: (text: string) => void
}

/** A secret value: masked, binary notice, env table or raw text. */
export function Value({ value, onCopy }: Props) {
  const [view, setView] = useState<'env' | 'raw'>('env')

  if (!value) {
    return (
      <div className="masked" aria-label="value hidden">
        {MASK}
      </div>
    )
  }
  if (value.text === null) {
    return (
      <div className="muted">
        # binary value · <span className="t-number">{value.size}</span> bytes — not shown as text.
      </div>
    )
  }
  const env = value.env
  const mode = env ? view : 'raw'

  return (
    <>
      {env && (
        <div className="tabs" role="tablist" aria-label="value view">
          <button role="tab" aria-selected={mode === 'env'} onClick={() => setView('env')}>
            env
          </button>
          <button role="tab" aria-selected={mode === 'raw'} onClick={() => setView('raw')}>
            raw
          </button>
        </div>
      )}
      {mode === 'env' && env ? (
        <div className="tablewrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>key</th>
                <th>value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {env.map((l, i) =>
                l.kind === 'pair' ? (
                  <tr key={i}>
                    <td className="t-keyword">{l.key}</td>
                    <td className="t-string" style={{ overflowWrap: 'anywhere' }}>
                      {l.value}
                    </td>
                    <td>
                      <button className="link" onClick={() => onCopy(l.value)} aria-label={`copy ${l.key}`}>
                        copy
                      </button>
                    </td>
                  </tr>
                ) : l.raw.trim() === '' ? null : (
                  <tr key={i}>
                    <td colSpan={3} className="muted">
                      {l.raw}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="value">{value.text}</pre>
      )}
      <div className="muted small">
        # <span className="t-number">{value.size}</span> bytes · hidden again after {HIDE_AFTER_MS / 1000}s or esc.
      </div>
    </>
  )
}
