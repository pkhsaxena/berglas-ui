import { type Ref, refString } from '../../../core/api'
import type { useDelete } from '../../../core/hooks/useDelete'
import { ConfirmName } from './ConfirmName'

type Props = { base: Ref; versions: number | null; del: ReturnType<typeof useDelete> }

export function DeleteSecret({ base, versions, del }: Props) {
  if (!del.open) return null
  return (
    <div className="card" style={{ borderColor: 'var(--t-error)' }}>
      <h2 className="t-error" style={{ color: 'var(--t-error)' }}>
        delete
      </h2>
      <div className="term-ln">
        <span className="t-prompt">$</span> <span className="t-function">delete</span> <span className="t-string">{refString(base)}</span>
      </div>
      <div className="t-error">
        this deletes the secret and {versions === null ? 'all its versions' : <><span className="t-number">{versions}</span> version{versions === 1 ? '' : 's'}</>}, including history. it cannot be undone.
      </div>
      <div className="muted small"># anything that reads this secret (deploys, services) will start failing.</div>
      <ConfirmName name={base.name} value={del.typed} onChange={del.setTyped} why="deleting is permanent." />
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
