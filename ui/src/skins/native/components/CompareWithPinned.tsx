import { useEffect } from 'react'
import { type Ref, versionOf } from '../../../core/api'
import { type Pinned, useCompare } from '../../../core/hooks/usePinned'
import { ErrorText } from './bits'
import { DiffView } from './DiffView'

type Props = {
  pinned: Pinned
  base: Ref
  /** base's newest version id, when known fresh */
  latestId?: string
  /** told whether the comparison is showing, so the layout can make room for it */
  onShowingChange?: (showing: boolean) => void
}

/** "Compare with pinned …" in the open secret's pane: pinned (a) against this secret's latest (b). */
export function CompareWithPinned({ pinned, base, latestId, onShowingChange }: Props) {
  const c = useCompare(pinned, base, latestId)
  const showing = !!c.result
  useEffect(() => {
    onShowingChange?.(showing)
    return () => onShowingChange?.(false)
  }, [showing, onShowingChange])
  return (
    <>
      <div className="row">
        <button className="btn" onClick={c.result ? c.clear : c.run} disabled={c.busy} title={`diff the pinned ${pinned.ref.name} against this secret`}>
          {c.busy ? 'Decrypting…' : c.result ? 'Hide comparison' : `Compare with pinned ${pinned.ref.name}`}
        </button>
        <ErrorText>{c.error && `Couldn't compare — ${c.error}`}</ErrorText>
      </div>
      {c.result && (
        <div className="section">
          <h3>
            Pinned {pinned.ref.name} → {c.result.current.name}
          </h3>
          {c.result.identical ? (
            <div className="good-text">✓ Identical — same text, same keys, same values.</div>
          ) : (
            <>
              <div className="muted small">
                a: pinned {pinned.ref.name} #{versionOf(pinned.secret)} → b: {c.result.current.name} #{versionOf(c.result.current)} (latest)
              </div>
              <DiffView diff={c.result} />
            </>
          )}
        </div>
      )}
    </>
  )
}
