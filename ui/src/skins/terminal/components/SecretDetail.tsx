import { type ReactNode, useEffect, useState } from 'react'
import { type Ref, refString, versionOf } from '../../../core/api'
import { envOf, toneOfSecret } from '../../../core/envtone'
import { useDelete } from '../../../core/hooks/useDelete'
import { useEditor } from '../../../core/hooks/useEditor'
import { useExport } from '../../../core/hooks/useExport'
import type { DroppedFile } from '../../../core/hooks/useFileDrop'
import { type Pinned, pinnedId } from '../../../core/hooks/usePinned'
import { useSecret } from '../../../core/hooks/useSecret'
import { protectedFor, readOnlyFor, useSettings, useStamp } from '../../../core/settings'
import { ago } from '../../../core/time'
import { CompareWithPinned } from './CompareWithPinned'
import { DeleteSecret } from './DeleteSecret'
import { ExportSecret } from './ExportSecret'
import { Editor } from './Editor'
import { EnvBanner, EnvTag } from './EnvMarks'
import { PaneTitle } from './PaneTitle'
import { Value } from './Value'
import { Versions } from './Versions'

type Props = {
  base: Ref // backend + parent + name, no version
  /** the source's group pattern, for the environment */
  group?: string
  onToast: (msg: string) => void
  onDeleted: () => void
  /** told when the editor opens and closes, so the view tabs can wait for it */
  onEditing?: (editing: boolean) => void
  /** what an edit in progress would lose (null when there is nothing unsaved), for the leave guard */
  onDirty?: (what: string | null) => void
  /** the pinned value, if any, shown beside this secret */
  pinned: Pinned | null
  onPin: (p: Pinned) => void
  /** normal width: show only the versions pane (the versions tab) */
  showVersions: boolean
  /** view tabs, set into the title of whichever pane is on top */
  titleTabs?: ReactNode
  /** zoomed out while comparing: tabs in the versions column's title */
  wideTabs?: ReactNode
  /** zoomed out while comparing: the overview or matrix shown in place of versions */
  wideAlt?: ReactNode
  /** a dropped file to open in the editor as the new value (once) */
  dropped?: DroppedFile | null
  onDroppedUsed?: () => void
  /** favourite and watch toggles in the header */
  marks?: { favorite: boolean; watched: boolean; onFavorite: () => void; onWatch: () => void; onCopyLink: () => void }
}

export function SecretDetail({ base, group, onToast, onDeleted, onEditing, onDirty, pinned, onPin, showVersions, titleTabs, wideTabs, wideAlt, dropped, onDroppedUsed, marks }: Props) {
  const s = useSecret(base, onToast)
  const { shown, revealed, hide } = s
  const ed = useEditor(base, () => {
    s.selectVersion('')
    void s.reloadVersions()
    onToast('saved')
  }, s.latestId)
  const editing = ed.phase !== 'idle'
  useEffect(() => {
    onEditing?.(editing)
    return () => onEditing?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  // a draft that differs from the loaded value is unsaved work
  const dirty = editing && ed.phase !== 'loading' && !ed.unchanged
  useEffect(() => {
    onDirty?.(dirty ? `your changes to ${base.name}` : null)
    return () => onDirty?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, base.name])
  // the exact version on screen, so the file holds what was revealed
  const shownRef: Ref = { ...base, version: shown ? versionOf(shown) : undefined }
  const x = useExport(shownRef, onToast)
  // a dropped file opens the editor with its text as the draft; the review is the confirmation
  useEffect(() => {
    if (!dropped) return
    onDroppedUsed?.()
    void ed.start(undefined, dropped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped])
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
  const tone = toneOfSecret(base.name, group)

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
        <Editor base={base} ed={ed} pinned={pinnedOther} titleTabs={titleTabs} tone={tone} />
      </div>
    )
  }

  // At normal width the versions tab shows only versions, and a revealed
  // value fills the column; the css keeps both side by side when zoomed out.
  // a revealed value or an open comparison with the pin fills the column
  // a pin names its exact version, so a newer one arriving later doesn't change what it points to
  const pinRef = shown ? { ...s.ref, version: versionOf(shown) } : s.ref
  const isPinned = !!pinned && pinnedId(pinned) === refString(pinRef)
  const mode = (showVersions ? ' show-versions' : revealed || comparing ? ' revealed' : '') + (wideAlt ? ' alt-wide' : '')
  return (
    <div className={`right${mode}`}>
      <div className="card pane secret-pane">
        <PaneTitle
          tabs={showVersions ? undefined : titleTabs}
          extra={
            <>
              {marks && (
                <>
                  <button aria-pressed={marks.favorite} aria-label={marks.favorite ? 'remove from favourites' : 'add to favourites'} title={marks.favorite ? 'remove from favourites' : 'add to favourites'} onClick={marks.onFavorite}>
                    {marks.favorite ? '★' : '☆'}
                  </button>
                  <button aria-pressed={marks.watched} onClick={marks.onWatch} title="notify me when this secret gets a new version (mac app)">
                    {marks.watched ? 'watching' : 'watch'}
                  </button>
                  <button onClick={marks.onCopyLink} title="copy a berglas-ui:// link that opens this secret in the mac app (no value in it)">
                    link
                  </button>
                </>
              )}
              {tone && <EnvTag tone={tone} label={envOf(base.name, group)} />}
            </>
          }
        >
          secret <span className="muted">— {base.name}</span>
        </PaneTitle>
        <div className="body">
          <EnvBanner tone={tone} isProtected={isProtected} readOnly={readOnly} />
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
            {shown && !(revealed && revealed.text === null) && (
              <button
                onClick={() => onPin({ ref: pinRef, secret: shown, value: revealed })}
                disabled={isPinned}
                title={revealed ? 'keep this value on screen while you open another secret' : 'keep this version on screen, still hidden; compare another secret against it'}
              >
                {isPinned ? 'pinned' : 'pin'}
              </button>
            )}
            {revealed && shown && !x.open && (
              <button onClick={x.start} title="save this version's value to a file, as plain text">
                save to file…
              </button>
            )}
            {readOnly && <span className="muted small"># read-only by config</span>}
            {!readOnly && isProtected && <span className="pill warn small">protected — saving asks for the name</span>}
            {shown && !editing && !readOnly && (
              <button
                className={tone === 'prod' ? 'prod' : undefined}
                onClick={() => {
                  hide()
                  void ed.start(s.isLatest ? undefined : versionOf(shown))
                }}
              >
                {s.isLatest ? (tone === 'prod' ? 'edit production…' : 'edit') : 'restore this version…'}
              </button>
            )}
            {shown && !editing && !readOnly && !del.open && <button onClick={del.start}>delete…</button>}
            <span role="alert" className="t-error">
              {(s.error && `error: ${s.error}`) || (!editing && ed.error && `error: ${ed.error}`)}
            </span>
          </div>

          {/* confirmations sit above the value, so a long key list never hides them */}
          {revealed && <ExportSecret target={shownRef} x={x} prod={tone === 'prod'} />}
          <DeleteSecret base={base} versions={s.versions?.length ?? null} del={del} />
          {pinnedOther && <CompareWithPinned key={pinnedId(pinnedOther)} pinned={pinnedOther} base={base} latestId={s.latestId} onShowingChange={setComparing} />}
          <Value value={revealed} onCopy={copy} against={pinnedOther} />
        </div>
      </div>
      <Versions base={base} versions={s.versions} versionsError={s.versionsError} shown={shown} onView={s.selectVersion} titleTabs={showVersions ? titleTabs : undefined} wideTabs={wideTabs} />
      {wideAlt && <div className="wide-alt">{wideAlt}</div>}
    </div>
  )
}
