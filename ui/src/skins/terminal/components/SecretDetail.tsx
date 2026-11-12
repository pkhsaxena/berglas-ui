import { type ReactNode, useEffect, useState } from 'react'
import { type Ref, refString, versionOf } from '../../../core/api'
import { useDelete } from '../../../core/hooks/useDelete'
import { useEditor } from '../../../core/hooks/useEditor'
import { type Pinned, pinnedId } from '../../../core/hooks/usePinned'
import { useSecret } from '../../../core/hooks/useSecret'
import { protectedFor, readOnlyFor, useSettings, useStamp } from '../../../core/settings'
import { ago } from '../../../core/time'
import { CompareWithPinned } from './CompareWithPinned'
import { DeleteSecret } from './DeleteSecret'
import { Editor } from './Editor'
import { PaneTitle } from './PaneTitle'
import { Value } from './Value'
import { Versions } from './Versions'

type Props = {
  base: Ref // backend + parent + name, no version
  onToast: (msg: string) => void
  onDeleted: () => void
  /** the pinned value, if any, shown beside this secret */
  pinned: Pinned | null
  onPin: (p: Pinned) => void
  /** normal width: show only the versions pane (the versions tab) */
  showVersions: boolean
  /** view tabs, set into the title of whichever pane is on top */
  titleTabs?: ReactNode
}

export function SecretDetail({ base, onToast, onDeleted, pinned, onPin, showVersions, titleTabs }: Props) {
  const s = useSecret(base, onToast)
  const { shown, revealed, hide } = s
  const ed = useEditor(base, () => {
    s.selectVersion('')
    void s.reloadVersions()
    onToast('saved')
  })
  const editing = ed.phase !== 'idle'
  // whether the compare-with-pin result is showing (it makes room like a reveal)
  const [comparing, setComparing] = useState(false)
  // the pinned value, unless it is this same secret (then there is nothing to line up against)
  const pinnedOther =
    pinned && !(pinned.ref.backend === base.backend && pinned.ref.parent === base.parent && pinned.ref.name === base.name) ? pinned : null
  const del = useDelete(base, () => {
    onToast('deleted')
    onDeleted()
  })
  const settings = useSettings()
  const stamp = useStamp()
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

  // While editing, the editor replaces both the secret value and the
  // versions pane.
  if (editing) {
    return (
      <div className="right single">
        <Editor base={base} ed={ed} pinned={pinnedOther} titleTabs={titleTabs} />
      </div>
    )
  }

  // At normal width the versions tab shows only versions, and a revealed
  // value fills the column; the css keeps both side by side when zoomed out.
  // a revealed value or an open comparison with the pin fills the column
  const mode = showVersions ? ' show-versions' : revealed || comparing ? ' revealed' : ''
  return (
    <div className={`right${mode}`}>
      <div className="card pane secret-pane">
        <PaneTitle tabs={showVersions ? undefined : titleTabs}>
          secret <span className="muted">— {base.name}</span>
        </PaneTitle>
        <div className="body">
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
            {revealed && shown && revealed.text !== null && (
              <button
                onClick={() => onPin({ ref: s.ref, secret: shown, value: revealed })}
                disabled={!!pinned && pinnedId(pinned) === refString(s.ref)}
                title="keep this value on screen while you open another secret"
              >
                {pinned && pinnedId(pinned) === refString(s.ref) ? 'pinned' : 'pin'}
              </button>
            )}
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

          {pinnedOther && <CompareWithPinned key={pinnedId(pinnedOther)} pinned={pinnedOther} base={base} onShowingChange={setComparing} />}
          <Value value={revealed} onCopy={copy} against={pinnedOther} />
          <DeleteSecret base={base} versions={s.versions?.length ?? null} del={del} />
        </div>
      </div>
      <Versions base={base} versions={s.versions} versionsError={s.versionsError} shown={shown} onView={s.selectVersion} titleTabs={showVersions ? titleTabs : undefined} />
    </div>
  )
}
