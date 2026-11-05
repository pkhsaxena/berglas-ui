import { type Ref, refString, versionOf } from '../../../core/api'
import { type Pinned, useCompare } from '../../../core/hooks/usePinned'
import { useStamp } from '../../../core/settings'
import { DiffView } from './DiffView'
import { Value } from './Value'

type Props = {
  pinned: Pinned
  /** the secret open next to it, if any */
  other: Ref | null
  onOpen: () => void
  onUnpin: () => void
  onCopy: (text: string) => void
}

/** A pinned value, kept while other secrets are open, with a compare against the open one. */
export function PinnedPane({ pinned, other, onOpen, onUnpin, onCopy }: Props) {
  const c = useCompare(pinned, other)
  const stamp = useStamp()
  const sameSecret = other && other.backend === pinned.ref.backend && other.parent === pinned.ref.parent && other.name === pinned.ref.name

  return (
    <div className="card pane pinned-pane">
      <h2>
        pinned <span className="muted">— {pinned.ref.name}</span>
      </h2>
      <div className="body">
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">cat</span> <span className="t-string">{refString(pinned.ref)}</span>{' '}
          <span className="muted"># pinned</span>
        </div>
        <div className="kv">
          <span className="label">{pinned.ref.backend === 'storage' ? 'generation' : 'version'}</span>
          <span>{versionOf(pinned.secret)}</span>
        </div>
        <div className="kv">
          <span className="label">updated</span>
          <span className="str">{stamp(pinned.secret.updatedAt)}</span>
        </div>
        <div className="row">
          {other && !sameSecret && (
            <button onClick={c.result ? c.clear : c.run} disabled={c.busy}>
              {c.busy ? 'decrypting…' : c.result ? 'hide comparison' : `compare with ${other.name}`}
            </button>
          )}
          {!sameSecret && <button onClick={onOpen}>open</button>}
          <button onClick={onUnpin}>unpin</button>
          <span role="alert" className="t-error">
            {c.error && `error: ${c.error}`}
          </span>
        </div>
        <div className="muted small"># stays until you unpin it. open another secret to compare or edit it beside this one.</div>

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

        <div className="section">
          <Value value={pinned.value} onCopy={onCopy} persistent />
        </div>
      </div>
    </div>
  )
}
