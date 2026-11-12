import { useEffect } from 'react'
import { type Ref, versionOf } from '../../../core/api'
import { type Pinned, useCompare } from '../../../core/hooks/usePinned'
import { DiffView } from './DiffView'

type Props = {
  pinned: Pinned
  base: Ref
  /** told whether the comparison is showing, so the layout can make room for it */
  onShowingChange?: (showing: boolean) => void
}

/**
 * "compare with pinned …" in the open secret's pane: diffs the pinned value
 * (a) against this secret's latest version (b) and shows the result here,
 * next to the secret it is about. Key it by pinned + open secret.
 */
export function CompareWithPinned({ pinned, base, onShowingChange }: Props) {
  const c = useCompare(pinned, base)
  const showing = !!c.result
  useEffect(() => {
    onShowingChange?.(showing)
    return () => onShowingChange?.(false)
  }, [showing, onShowingChange])
  return (
    <>
      <div className="row">
        <button onClick={c.result ? c.clear : c.run} disabled={c.busy} title={`diff the pinned ${pinned.ref.name} against this secret`}>
          {c.busy ? 'decrypting…' : c.result ? 'hide comparison' : `compare with pinned ${pinned.ref.name}`}
        </button>
        <span role="alert" className="t-error">
          {c.error && `error: ${c.error}`}
        </span>
      </div>
      {c.result && (
        <div className="section">
          <div className="term-ln">
            <span className="t-prompt">$</span> <span className="t-function">diff</span> <span className="t-keyword">pinned</span>{' '}
            <span className="t-string">{c.result.current.name}</span>
          </div>
          {c.result.identical ? (
            <div className="t-function">✓ identical — same text, same keys, same values.</div>
          ) : (
            <>
              <div className="muted small">
                # a: pinned {pinned.ref.name} #{versionOf(pinned.secret)} → b: {c.result.current.name} #{versionOf(c.result.current)} (latest)
              </div>
              <DiffView diff={c.result} />
            </>
          )}
        </div>
      )}
    </>
  )
}
