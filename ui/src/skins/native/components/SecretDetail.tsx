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
import { EnvBadge, EnvBanner, ErrorText, LockIcon, PaneHead } from './bits'
import { CompareWithPinned } from './CompareWithPinned'
import { DeleteSecret } from './DeleteSecret'
import { ExportSecret } from './ExportSecret'
import { Editor } from './Editor'
import { Value } from './Value'
import { Versions } from './Versions'

type Props = {
  base: Ref // backend + parent + name, no version
  /** the source's group pattern, for the environment */
  group?: string
  onToast: (msg: string) => void
  onDeleted: () => void
  /** the pinned value, if any, shown beside this secret */
  pinned: Pinned | null
  onPin: (p: Pinned) => void
  /** normal width: show only the versions pane (the Versions tab) */
  showVersions: boolean
  /** view tabs, set into the header of whichever pane is on top */
  titleTabs?: ReactNode
  /** zoomed out while comparing: tabs in the versions column's header */
  wideTabs?: ReactNode
  /** zoomed out while comparing: the overview or matrix shown in place of versions */
  wideAlt?: ReactNode
  /** a dropped file to open in the editor as the new value (once) */
  dropped?: DroppedFile | null
  onDroppedUsed?: () => void
}

export function SecretDetail({ base, group, onToast, onDeleted, pinned, onPin, showVersions, titleTabs, wideTabs, wideAlt, dropped, onDroppedUsed }: Props) {
  const s = useSecret(base, onToast)
  const { shown, revealed, hide } = s
  const ed = useEditor(
    base,
    () => {
      s.selectVersion('')
      void s.reloadVersions()
      onToast('Saved')
    },
    s.latestId,
  )
  const editing = ed.phase !== 'idle'
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
  const [comparing, setComparing] = useState(false)
  const pinnedOther =
    pinned && !(pinned.ref.backend === base.backend && pinned.ref.parent === base.parent && pinned.ref.name === base.name) ? pinned : null
  const del = useDelete(base, () => {
    onToast('Deleted')
    onDeleted()
  })
  const settings = useSettings()
  const stamp = useStamp()
  const readOnly = readOnlyFor(settings, base)
  const isProtected = protectedFor(settings, base)
  const tone = toneOfSecret(base.name, group)
  const envName = envOf(base.name, group)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide])

  const copy = async (text?: string) => {
    if (await s.copy(text)) onToast(settings.clipboardClearSeconds > 0 ? `Copied · clears in ${settings.clipboardClearSeconds}s` : 'Copied')
  }

  if (editing) {
    return (
      <div className="right single">
        <Editor base={base} ed={ed} pinned={pinnedOther} titleTabs={titleTabs} tone={tone} />
      </div>
    )
  }

  const mode = (showVersions ? ' show-versions' : revealed || comparing ? ' revealed' : '') + (wideAlt ? ' alt-wide' : '')
  const isPinned = !!pinned && pinnedId(pinned) === refString(s.ref)
  return (
    <div className={`right${mode}`}>
      <div className="pane secret-pane">
        <EnvBanner tone={tone} isProtected={isProtected} readOnly={readOnly} />
        <PaneHead
          tabs={showVersions ? undefined : titleTabs}
          title={<span className="mono">{base.name}</span>}
          actions={
            <>
              <EnvBadge tone={tone} label={envName} />
              {isProtected && tone !== 'prod' && (
                <span className="badge warn">
                  <LockIcon size={11} /> protected
                </span>
              )}
            </>
          }
        />
        <div className="body">
          {s.versionsError ? (
            <div role="alert" className="bad-text">
              Couldn't load this secret — {s.versionsError}
            </div>
          ) : s.versions === null ? (
            <div className="muted">Loading details…</div>
          ) : !shown ? (
            <div className="muted">No versions found — the secret may have just been deleted. Refresh the list.</div>
          ) : (
            <div>
              <div className="kv">
                <span>{base.backend === 'storage' ? 'Generation' : 'Version'}</span>
                <span>
                  <span className="mono">{versionOf(shown)}</span> {s.isLatest ? <span className="badge good">latest</span> : <span className="badge warn">older version</span>}
                </span>
              </div>
              <div className="kv">
                <span>Updated</span>
                <span>
                  {stamp(shown.updatedAt)} <span className="muted">· {ago(shown.updatedAt)}</span>
                </span>
              </div>
              {shown.kmsKey && (
                <div className="kv">
                  <span>KMS key</span>
                  <span className="mono small">{shown.kmsKey}</span>
                </div>
              )}
              {base.backend === 'sm' && (
                <div className="kv">
                  <span>Replication</span>
                  <span>{shown.locations?.length ? shown.locations.join(', ') : 'automatic'}</span>
                </div>
              )}
              <div className="kv">
                <span>Location</span>
                <span className="mono small">{refString(s.ref)}</span>
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            {revealed ? (
              <button className="btn" onClick={hide}>
                Hide
              </button>
            ) : (
              <button className="btn primary" onClick={s.reveal} disabled={s.busy || !shown}>
                {s.busy ? 'Decrypting…' : 'Reveal'}
              </button>
            )}
            <button className="btn" onClick={() => copy(revealed?.text ?? undefined)} disabled={s.busy || !shown}>
              Copy value
            </button>
            {revealed && shown && revealed.text !== null && (
              <button className="btn" onClick={() => onPin({ ref: s.ref, secret: shown, value: revealed })} disabled={isPinned} title="keep this value on screen while you open another secret">
                {isPinned ? 'Pinned' : 'Pin'}
              </button>
            )}
            {revealed && shown && !x.open && (
              <button className="btn" onClick={x.start} title="save this version's value to a file, as plain text">
                Save to file…
              </button>
            )}
            <span className="spacer" />
            {readOnly && <span className="muted small">Read-only by config</span>}
            {shown && !readOnly && (
              <button
                className={tone === 'prod' ? 'btn prod' : 'btn'}
                onClick={() => {
                  hide()
                  void ed.start(s.isLatest ? undefined : versionOf(shown))
                }}
              >
                {s.isLatest ? (tone === 'prod' ? 'Edit production…' : 'Edit…') : 'Restore this version…'}
              </button>
            )}
            {shown && !readOnly && !del.open && (
              <button className="btn danger" onClick={del.start}>
                Delete…
              </button>
            )}
          </div>
          <ErrorText>{s.error || ed.error}</ErrorText>

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
