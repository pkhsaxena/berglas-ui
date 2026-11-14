import { type Ref, refString } from '../../../core/api'
import type { useDelete } from '../../../core/hooks/useDelete'
import { ConfirmName, ErrorText } from './bits'

type Props = { base: Ref; versions: number | null; del: ReturnType<typeof useDelete> }

export function DeleteSecret({ base, versions, del }: Props) {
  if (!del.open) return null
  return (
    <div className="section danger">
      <h3 className="bad-text">Delete {refString(base)}?</h3>
      <div>
        This deletes the secret and {versions === null ? 'all its versions' : `${versions} version${versions === 1 ? '' : 's'}`}, including history. It can't be undone.
      </div>
      <div className="muted small">Anything that reads this secret (deploys, services) will start failing.</div>
      <ConfirmName name={base.name} value={del.typed} onChange={del.setTyped} why="Deleting is permanent." />
      <div className="row">
        <button className="btn danger" onClick={del.remove} disabled={!del.confirmed || del.busy}>
          {del.busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button className="btn" onClick={del.cancel} disabled={del.busy}>
          Cancel
        </button>
        <ErrorText>{del.error && `Couldn't delete — ${del.error}`}</ErrorText>
      </div>
    </div>
  )
}
