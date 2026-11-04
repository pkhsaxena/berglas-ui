import { useEffect } from 'react'
import { type Ref, refString, versionOf } from '../../../core/api'
import { useDelete } from '../../../core/hooks/useDelete'
import { useEditor } from '../../../core/hooks/useEditor'
import { DeleteSecret } from './DeleteSecret'
import { useSecret } from '../../../core/hooks/useSecret'
import { history } from '../../../core/overview'
import { protectedFor, readOnlyFor, useSettings } from '../../../core/settings'
import { Editor } from './Editor'
import { ago, stamp } from '../../../core/time'
import { Value } from './Value'
import { Versions } from './Versions'

type Props = {
  base: Ref // backend + parent + name, no version
  onToast: (msg: string) => void
  onDeleted: () => void
}

export function SecretDetail({ base, onToast, onDeleted }: Props) {
  const s = useSecret(base, onToast)
  const { shown, revealed, hide } = s
  const ed = useEditor(base, () => {
    s.selectVersion('')
    void s.reloadVersions()
    onToast('saved')
  })
  const editing = ed.phase !== 'idle'
  const hist = s.versions ? history(s.versions) : null
  const del = useDelete(base, () => {
    onToast('deleted')
    onDeleted()
  })
  const settings = useSettings()
  const readOnly = readOnlyFor(settings, base)
  const isProtected = protectedFor(settings, base)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide])

  const copy = async (text?: string) => {
    if (await s.copy(text)) onToast(settings.clipboardClearSeconds > 0 ? `copied · clears in ${settings.clipboardClearSeconds}s` : 'copied')
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
            {hist && hist.first && (
              <div className="kv">
                <span className="label">history</span>
                <span className="str">
                  {hist.count} version{hist.count === 1 ? '' : 's'} since {stamp(hist.first).slice(0, 10)}
                  {hist.everyDays && <span className="muted"> · a change every ~{hist.everyDays}d</span>}
                </span>
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
          {readOnly && <span className="muted small"># read-only by config</span>}
          {!readOnly && isProtected && <span className="pill warn small">protected — saving asks for the name</span>}
          {shown && !editing && !readOnly && (
            <button
              onClick={() => {
                hide()
                void ed.start(s.isLatest ? undefined : versionOf(shown))
              }}
            >
              {s.isLatest ? 'edit' : 'restore this version…'}
            </button>
          )}
          {shown && !editing && !readOnly && !del.open && <button onClick={del.start}>delete…</button>}
          <span role="alert" className="t-error">
            {(s.error && `error: ${s.error}`) || (!editing && ed.error && `error: ${ed.error}`)}
          </span>
        </div>

        <Value value={revealed} onCopy={copy} />
      </div>

      <DeleteSecret base={base} versions={s.versions?.length ?? null} del={del} />
      {/* the editor takes the versions view's place while editing */}
      {editing ? (
        <Editor base={base} ed={ed} />
      ) : (
        <Versions base={base} versions={s.versions} versionsError={s.versionsError} shown={shown} onView={s.selectVersion} />
      )}
    </>
  )
}
