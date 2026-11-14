import { type Ref, versionOf } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import type { Pinned } from '../../../core/hooks/usePinned'
import { useStamp } from '../../../core/settings'
import { EnvBadge, PaneHead } from './bits'
import { Value } from './Value'

type Props = {
  pinned: Pinned
  /** the secret open next to it, if any */
  other: Ref | null
  /** the source's group pattern, for the environment badge */
  group?: string
  onOpen: () => void
  onUnpin: () => void
  onCopy: (text: string) => void
}

/** A pinned value, kept while other secrets are open: the reference the open secret is marked against. */
export function PinnedPane({ pinned, other, group, onOpen, onUnpin, onCopy }: Props) {
  const stamp = useStamp()
  const sameSecret = other && other.backend === pinned.ref.backend && other.parent === pinned.ref.parent && other.name === pinned.ref.name
  const tone = toneOfSecret(pinned.ref.name, group)

  return (
    <div className="pane pinned-pane">
      {tone && <div className={`env-strip tone-${tone}`} />}
      <PaneHead
        title={
          <>
            Pinned · <span className="mono">{pinned.ref.name}</span>
          </>
        }
        actions={
          <>
            <EnvBadge tone={tone} />
            {!sameSecret && (
              <button className="btn" onClick={onOpen}>
                Open
              </button>
            )}
            <button className="btn" onClick={onUnpin}>
              Unpin
            </button>
          </>
        }
      />
      <div className="body">
        <div className="kv">
          <span>{pinned.ref.backend === 'storage' ? 'Generation' : 'Version'}</span>
          <span className="mono">{versionOf(pinned.secret)}</span>
        </div>
        <div className="kv">
          <span>Updated</span>
          <span>{stamp(pinned.secret.updatedAt)}</span>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          Stays until you unpin it. Open another secret: its pane compares against this one, and revealing or editing marks each key.
        </div>
        <Value value={pinned.value} onCopy={onCopy} persistent />
      </div>
    </div>
  )
}
