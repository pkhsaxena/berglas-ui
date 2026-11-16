import { refString, versionOf } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import { useExport } from '../../../core/hooks/useExport'
import { type Pinned, usePinnedPane } from '../../../core/hooks/usePinned'
import type { Revealed } from '../../../core/hooks/useSecret'
import { useStamp } from '../../../core/settings'
import { ago } from '../../../core/time'
import { EnvTag } from './EnvMarks'
import { ExportSecret } from './ExportSecret'
import { Value } from './Value'

type Props = {
  pinned: Pinned
  /** the source's group pattern, for the environment tag */
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

/**
 * A pinned version, kept while other secrets are open. It is the reference: the
 * open secret's pane marks its keys against it and offers the compare.
 */
export function PinnedPane({ pinned, group, onUnpin, onCopy, onValue, onHide, onToast }: Props) {
  const stamp = useStamp()
  const tone = toneOfSecret(pinned.ref.name, group)
  const p = usePinnedPane(pinned, onValue, onHide, onToast)
  const x = useExport(pinned.ref, onToast)
  const { secret, value } = pinned

  return (
    <div className="card pane pinned-pane">
      <h2>
        pinned <span className="muted">— {pinned.ref.name}</span>
        <EnvTag tone={tone} />
      </h2>
      <div className="body">
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">cat</span> <span className="t-string">{refString(pinned.ref)}</span>{' '}
          <span className="muted"># pinned</span>
        </div>
        <div className="kv">
          <span className="label">{pinned.ref.backend === 'storage' ? 'generation' : 'version'}</span>
          <span>{versionOf(secret)}</span>
        </div>
        <div className="kv">
          <span className="label">updated</span>
          <span className="str">
            {stamp(secret.updatedAt)} <span className="muted">· {ago(secret.updatedAt)}</span>
          </span>
        </div>
        {secret.kmsKey && (
          <div className="kv">
            <span className="label">kms key</span>
            <span className="str">{secret.kmsKey}</span>
          </div>
        )}
        {pinned.ref.backend === 'sm' && (
          <div className="kv">
            <span className="label">replication</span>
            <span className="str">{secret.locations?.length ? secret.locations.join(', ') : 'automatic'}</span>
          </div>
        )}
        <div className="row">
          {value ? (
            <button onClick={p.hide}>hide</button>
          ) : (
            <button onClick={p.reveal} disabled={p.busy}>
              {p.busy ? 'decrypting…' : 'reveal'}
            </button>
          )}
          <button onClick={p.copy} disabled={p.busy}>
            copy value
          </button>
          {value && !x.open && (
            <button onClick={x.start} title="save the pinned version's value to a file, as plain text">
              save to file…
            </button>
          )}
          <button onClick={onUnpin}>unpin</button>
        </div>
        {p.error && (
          <div role="alert" className="t-error">
            error: {p.error}
          </div>
        )}
        <div className="muted small">
          {value
            ? '# stays until you unpin or hide it. open another secret: its pane compares against this one, and reveal or edit marks each key.'
            : '# hidden. open another secret and compare: you see the diff, the values stay hidden.'}
        </div>
        {value && <ExportSecret target={pinned.ref} x={x} prod={tone === 'prod'} />}

        <div className="section">
          <Value value={value} onCopy={onCopy} persistent />
        </div>
      </div>
    </div>
  )
}
