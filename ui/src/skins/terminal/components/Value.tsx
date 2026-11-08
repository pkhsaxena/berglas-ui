import { useState } from 'react'
import type { Revealed } from '../../../core/hooks/useSecret'
import { useSettings } from '../../../core/settings'
import { EnvRows, OrderToggle } from './EnvRows'

const MASK = '••••••••••••'

type Props = {
  value: Revealed | null
  onCopy: (text: string) => void
  /** pinned values do not hide on a timer */
  persistent?: boolean
}

/** A secret value: masked, binary notice, env table or raw text. */
export function Value({ value, onCopy, persistent = false }: Props) {
  const [view, setView] = useState<'env' | 'raw'>('env')
  const { revealSeconds, envOrder } = useSettings()

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
        <div className="row" style={{ margin: 0 }}>
          <div className="tabs" role="tablist" aria-label="value view">
            <button role="tab" aria-selected={mode === 'env'} onClick={() => setView('env')}>
              env
            </button>
            <button role="tab" aria-selected={mode === 'raw'} onClick={() => setView('raw')}>
              raw
            </button>
          </div>
          {mode === 'env' && <OrderToggle />}
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
            <EnvRows
              text={value.text}
              order={envOrder}
              cols={3}
              renderPair={(l, i) => (
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
              )}
            />
          </table>
        </div>
      ) : (
        <pre className="value">{value.text}</pre>
      )}
      <div className="muted small">
        # <span className="t-number">{value.size}</span> bytes · {persistent ? 'shown until unpinned.' : revealSeconds > 0 ? `hidden again after ${revealSeconds}s or esc.` : 'esc hides it.'}
      </div>
    </>
  )
}
