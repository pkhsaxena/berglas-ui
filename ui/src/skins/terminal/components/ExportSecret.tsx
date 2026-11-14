import { useEffect, useRef } from 'react'
import { refString, type Ref } from '../../../core/api'
import type { ExportState } from '../../../core/hooks/useExport'
import { ConfirmName } from './ConfirmName'

/** The confirmation before saving a value to a file. */
export function ExportSecret({ target, x, prod }: { target: Ref; x: ExportState; prod: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (x.open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [x.open])
  if (!x.open) return null
  return (
    <div ref={ref} className={prod ? 'section danger' : 'section'}>
      <div className="term-ln">
        <span className="t-prompt">$</span> <span className="t-function">save</span> <span className="t-string">{refString(target)}</span> <span className="muted">&gt; file</span>
      </div>
      <div className={prod ? 't-error' : undefined}>the file holds the value as plain text. anyone who can read it can read the secret, and it stays on disk until you delete it.</div>
      <div className="muted small"># written readable by you only (mode 600); the export goes to the audit log, if one is set.</div>
      {x.isProtected && <ConfirmName name={target.name} value={x.typed} onChange={x.setTyped} why="it is protected by config." />}
      <div className="row">
        <button className={prod ? 'primary prod' : 'primary'} onClick={x.save} disabled={!x.confirmed || x.busy}>
          {x.busy ? 'saving…' : 'choose where to save…'}
        </button>
        <button onClick={x.cancel} disabled={x.busy}>
          cancel
        </button>
        <span role="alert" className="t-error">
          {x.error && `error: ${x.error}`}
        </span>
      </div>
    </div>
  )
}
