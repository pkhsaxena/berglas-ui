import { useEffect, useRef } from 'react'
import { type Ref, refString } from '../../../core/api'
import type { useDelete } from '../../../core/hooks/useDelete'
import { CONFIRM_WORD } from '../../../core/settings'
import { ConfirmName } from './ConfirmName'

type Props = { base: Ref; versions: number | null; del: ReturnType<typeof useDelete> }

export function DeleteSecret({ base, versions, del }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (del.open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [del.open])
  if (!del.open) return null
  return (
    <div ref={ref} className="section danger">
      <div className="term-ln">
        <span className="t-prompt">$</span> <span className="t-function">delete</span> <span className="t-string">{refString(base)}</span>
      </div>
      <div className="t-error">
        this deletes the secret and {versions === null ? 'all its versions' : <><span className="t-number">{versions}</span> version{versions === 1 ? '' : 's'}</>}, including history. it cannot be undone.
      </div>
      <div className="muted small"># anything that reads this secret (deploys, services) will start failing.</div>
      <ConfirmName name={base.name} word={CONFIRM_WORD} action="deleting" value={del.typed} onChange={del.setTyped} why="deleting is permanent." />
      <div className="row">
        <button onClick={del.remove} disabled={!del.confirmed || del.busy} style={{ color: 'var(--t-error)', borderColor: 'var(--t-error)' }}>
          {del.busy ? 'deleting…' : 'delete permanently'}
        </button>
        <button onClick={del.cancel} disabled={del.busy}>
          cancel
        </button>
        <span role="alert" className="t-error">
          {del.error && `error: ${del.error}`}
        </span>
      </div>
    </div>
  )
}
