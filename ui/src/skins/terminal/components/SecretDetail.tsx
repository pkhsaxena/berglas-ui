import { useEffect } from 'react'
import { type Ref, refString, versionOf } from '../../../core/api'
import { useSecret } from '../../../core/hooks/useSecret'
import { ago, stamp } from '../../../core/time'
import { Value } from './Value'
import { Versions } from './Versions'

type Props = {
  base: Ref // backend + parent + name, no version
  onToast: (msg: string) => void
}

export function SecretDetail({ base, onToast }: Props) {
  const s = useSecret(base)
  const { shown, revealed, hide } = s

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide])

  const copy = async (text?: string) => {
    if (await s.copy(text)) onToast('copied')
  }

  return (
    <>
      <div className="card">
        <h2>
          secret <span className="muted">— {base.name}</span>
        </h2>
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">cat</span> <span className="t-string">{refString(s.ref)}</span>
        </div>

        {s.versionsError ? (
          <div role="alert" className="t-error">
            error: {s.versionsError}
          </div>
        ) : s.versions === null ? (
          <div className="muted"># loading metadata…</div>
        ) : !shown ? (
          <div className="muted"># no versions found — the secret may have just been deleted. refresh the list.</div>
        ) : (
          <div style={{ margin: '6px 0' }}>
            <div className="kv">
              <span className="label">{base.backend === 'storage' ? 'generation' : 'version'}</span>
              <span>
                {versionOf(shown)} {s.isLatest ? <span className="pill good">latest</span> : <span className="pill warn">old</span>}
              </span>
            </div>
            <div className="kv">
              <span className="label">updated</span>
              <span className="str">
                {stamp(shown.updatedAt)} <span className="muted">· {ago(shown.updatedAt)}</span>
              </span>
            </div>
            {shown.kmsKey && (
              <div className="kv">
                <span className="label">kms key</span>
                <span className="str">{shown.kmsKey}</span>
              </div>
            )}
            {base.backend === 'sm' && (
              <div className="kv">
                <span className="label">replication</span>
                <span className="str">{shown.locations?.length ? shown.locations.join(', ') : 'automatic'}</span>
              </div>
            )}
          </div>
        )}

        <div className="row">
          {revealed ? (
            <button onClick={hide}>hide</button>
          ) : (
            <button onClick={s.reveal} disabled={s.busy || !shown}>
              {s.busy ? 'decrypting…' : 'reveal'}
            </button>
          )}
          <button onClick={() => copy(revealed?.text ?? undefined)} disabled={s.busy || !shown}>
            copy value
          </button>
          <span role="alert" className="t-error">
            {s.error && `error: ${s.error}`}
          </span>
        </div>

        <Value value={revealed} onCopy={copy} />
      </div>

      <Versions base={base} versions={s.versions} versionsError={s.versionsError} shown={shown} onView={s.selectVersion} />
    </>
  )
}
