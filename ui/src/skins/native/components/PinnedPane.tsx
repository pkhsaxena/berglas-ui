import { refString, versionOf } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import { useExport } from '../../../core/hooks/useExport'
import { type Pinned, usePinnedPane } from '../../../core/hooks/usePinned'
import type { Revealed } from '../../../core/hooks/useSecret'
import { useStamp } from '../../../core/settings'
import { ago } from '../../../core/time'
import { EnvBadge, ErrorText, PaneHead } from './bits'
import { ExportSecret } from './ExportSecret'
import { Value } from './Value'

type Props = {
  pinned: Pinned
  /** the source's group pattern, for the environment badge */
  group?: string
  onUnpin: () => void
  /** copies one key's value from the table */
  onCopy: (text: string) => void
  /** the pin's value once revealed here */
  onValue: (p: Pinned, value: Revealed) => void
  /** masks the pin's value again */
  onHide: (p: Pinned) => void
  onToast: (msg: string) => void
}

/** A pinned version, kept while other secrets are open: the reference the open secret is marked and compared against. */
export function PinnedPane({ pinned, group, onUnpin, onCopy, onValue, onHide, onToast }: Props) {
  const stamp = useStamp()
  const tone = toneOfSecret(pinned.ref.name, group)
  const p = usePinnedPane(pinned, onValue, onHide, onToast)
  const x = useExport(pinned.ref, onToast)
  const { secret, value } = pinned

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
            <button className="btn" onClick={onUnpin}>
              Unpin
            </button>
          </>
        }
      />
      <div className="body">
        <div className="kv">
          <span>{pinned.ref.backend === 'storage' ? 'Generation' : 'Version'}</span>
          <span className="mono">{versionOf(secret)}</span>
        </div>
        <div className="kv">
          <span>Updated</span>
          <span>
            {stamp(secret.updatedAt)} <span className="muted">· {ago(secret.updatedAt)}</span>
          </span>
        </div>
        {secret.kmsKey && (
          <div className="kv">
            <span>KMS key</span>
            <span className="mono small">{secret.kmsKey}</span>
          </div>
        )}
        {pinned.ref.backend === 'sm' && (
          <div className="kv">
            <span>Replication</span>
            <span>{secret.locations?.length ? secret.locations.join(', ') : 'automatic'}</span>
          </div>
        )}
        <div className="kv">
          <span>Location</span>
          <span className="mono small">{refString(pinned.ref)}</span>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {value ? (
            <button className="btn" onClick={p.hide}>
              Hide
            </button>
          ) : (
            <button className="btn primary" onClick={p.reveal} disabled={p.busy}>
              {p.busy ? 'Decrypting…' : 'Reveal'}
            </button>
          )}
          <button className="btn" onClick={p.copy} disabled={p.busy}>
            Copy value
          </button>
          {value && !x.open && (
            <button className="btn" onClick={x.start} title="save the pinned version's value to a file, as plain text">
              Save to file…
            </button>
          )}
        </div>
        <ErrorText>{p.error}</ErrorText>
        <div className="muted small" style={{ marginTop: 6 }}>
          {value
            ? 'Stays until you unpin or hide it. Open another secret: its pane compares against this one, and revealing or editing marks each key.'
            : 'Hidden. Open another secret and compare: you see the diff, the values stay hidden.'}
        </div>
        {value && <ExportSecret target={pinned.ref} x={x} prod={tone === 'prod'} />}
        <Value value={value} onCopy={onCopy} persistent />
      </div>
    </div>
  )
}
