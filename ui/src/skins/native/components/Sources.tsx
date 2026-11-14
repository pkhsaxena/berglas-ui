import { useState } from 'react'
import type { Backend } from '../../../core/api'
import { type Source, sourceId } from '../../../core/sources'
import { ErrorText, PaneHead } from './bits'
import { Select } from './Select'

type Props = {
  sources: Source[]
  configPath: string
  saveError: string
  active: Source | null
  onSelect: (s: Source) => void
  /** returns an error message, or '' on success */
  onAdd: (s: Source) => string
  onRemove: (s: Source) => void
}

const BucketIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 7h16l-1.5 12h-13z" />
    <path d="M4 7l2-3h12l2 3" />
  </svg>
)
const VaultIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export function Sources({ sources, configPath, saveError, active, onSelect, onAdd, onRemove }: Props) {
  const [backend, setBackend] = useState<Backend>('storage')
  const [parent, setParent] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(sources.length === 0)

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = onAdd({ backend, parent })
    setErr(msg)
    if (!msg) {
      setParent('')
      setAdding(false)
    }
  }

  return (
    <div className="pane sources-pane">
      <PaneHead
        title="Sources"
        actions={
          <button className="icon-btn" onClick={() => setAdding(!adding)} aria-expanded={adding} aria-label="add a source" title="Add a bucket or project">
            +
          </button>
        }
      />
      <div className="body">
        {sources.length === 0 && <div className="muted small">No sources yet. Add a bucket (Cloud Storage + KMS) or a project (Secret Manager).</div>}
        <ul className="clean">
          {sources.map((s) => (
            <li key={sourceId(s)} className="source-row">
              <button className="rowbtn" aria-current={active && sourceId(active) === sourceId(s) ? 'true' : undefined} onClick={() => onSelect(s)} title={`${s.backend === 'storage' ? 'berglas://' : 'sm://'}${s.parent}`}>
                {s.backend === 'storage' ? <BucketIcon /> : <VaultIcon />}
                <span className="nm">{s.label || s.parent}</span>
                <span className="spacer" />
                <span className="meta">
                  {s.readOnly ? 'read-only' : s.backend === 'storage' ? 'storage' : 'secret mgr'}
                  {s.default ? ' · default' : ''}
                </span>
              </button>
              <button className="icon-btn" onClick={() => onRemove(s)} aria-label={`remove ${s.parent}`} title="Remove from the list (deletes nothing)">
                ✕
              </button>
            </li>
          ))}
        </ul>
        {adding && (
          <form className="row" onSubmit={add} style={{ padding: '0 4px' }}>
            <Select
              ariaLabel="backend"
              value={backend}
              options={[
                { value: 'storage', label: 'Storage + KMS' },
                { value: 'sm', label: 'Secret Manager' },
              ]}
              onChange={(v) => setBackend(v as Backend)}
            />
            <input aria-label={backend === 'storage' ? 'bucket name' : 'project id'} placeholder={backend === 'storage' ? 'bucket name' : 'project id'} value={parent} onChange={(e) => setParent(e.target.value)} autoComplete="off" spellCheck={false} />
            <button className="btn" type="submit">
              Add
            </button>
            <ErrorText>{err}</ErrorText>
          </form>
        )}
        <ErrorText>{saveError && `Couldn't save the config — ${saveError}`}</ErrorText>
        {configPath && (
          <div className="muted small" style={{ padding: '4px 8px', overflowWrap: 'anywhere' }}>
            Saved in {configPath}
          </div>
        )}
      </div>
    </div>
  )
}
