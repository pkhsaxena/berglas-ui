import { useEffect, useRef } from 'react'
import { refString, type Ref } from '../../../core/api'
import type { ExportState } from '../../../core/hooks/useExport'
import { ConfirmName, ErrorText } from './bits'

/** The confirmation before saving a value to a file. */
export function ExportSecret({ target, x, prod }: { target: Ref; x: ExportState; prod: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (x.open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [x.open])
  if (!x.open) return null
  return (
    <div ref={ref} className={prod ? 'section danger' : 'section'}>
      <h3 className={prod ? 'bad-text' : undefined}>Save {refString(target)} to a file?</h3>
      <div>The file holds the value as plain text. Anyone who can read the file can read the secret, and it stays on disk until you delete it.</div>
      <div className="muted small">The app writes it readable by you only (mode 600) and adds the export to the audit log, if one is set.</div>
      {x.isProtected && <ConfirmName name={target.name} value={x.typed} onChange={x.setTyped} why="It is protected by config." />}
      <div className="row">
        <button className={prod ? 'btn danger' : 'btn primary'} onClick={x.save} disabled={!x.confirmed || x.busy}>
          {x.busy ? 'Saving…' : 'Choose where to save…'}
        </button>
        <button className="btn" onClick={x.cancel} disabled={x.busy}>
          Cancel
        </button>
        <ErrorText>{x.error && `Couldn't save — ${x.error}`}</ErrorText>
      </div>
    </div>
  )
}
