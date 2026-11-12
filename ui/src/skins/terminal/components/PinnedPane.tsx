import { type Ref, refString, versionOf } from '../../../core/api'
import type { Pinned } from '../../../core/hooks/usePinned'
import { useStamp } from '../../../core/settings'
import { Value } from './Value'

type Props = {
  pinned: Pinned
  /** the secret open next to it, if any */
  other: Ref | null
  onOpen: () => void
  onUnpin: () => void
  onCopy: (text: string) => void
}

/**
 * A pinned value, kept while other secrets are open. It is the reference: the
 * open secret's pane marks its keys against it and offers the compare.
 */
export function PinnedPane({ pinned, other, onOpen, onUnpin, onCopy }: Props) {
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
          {!sameSecret && <button onClick={onOpen}>open</button>}
          <button onClick={onUnpin}>unpin</button>
        </div>
        <div className="muted small">
          # stays until you unpin it. open another secret: its pane compares against this one, and reveal or edit marks each key.
        </div>

        <div className="section">
          <Value value={pinned.value} onCopy={onCopy} persistent />
        </div>
      </div>
    </div>
  )
}
