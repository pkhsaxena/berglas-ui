import { useState } from 'react'
import type { Backend } from '../api'
import { type Source, sourceId } from '../sources'

type Props = {
  sources: Source[]
  configPath: string
  saveError: string
  active: Source | null
  onSelect: (s: Source) => void
  onAdd: (s: Source) => void
  onRemove: (s: Source) => void
}

export function Sources({ sources, configPath, saveError, active, onSelect, onAdd, onRemove }: Props) {
  const [backend, setBackend] = useState<Backend>('storage')
  const [parent, setParent] = useState('')
  const [err, setErr] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const p = parent.trim()
    if (!p) return setErr(backend === 'storage' ? 'enter a bucket name' : 'enter a project id')
    if (/[\s/]/.test(p)) return setErr('no spaces or slashes — just the bucket or project id')
    const s = { backend, parent: p }
    if (sources.some((x) => sourceId(x) === sourceId(s))) return setErr('already added')
    setErr('')
    setParent('')
    onAdd(s)
  }

  return (
    <div className="card">
      <h2>
        sources <span className="muted">— where to scan for secrets</span>
      </h2>
      {sources.length === 0 ? (
        <div className="muted"># no sources yet. add a bucket (cloud storage + kms) or a project (secret manager) below.</div>
      ) : (
        <ul className="clean">
          {sources.map((s) => (
            <li key={sourceId(s)} className="row" style={{ margin: 0 }}>
              <button
                className="rowbtn"
                style={{ flex: 1, width: 'auto' }}
                aria-current={active && sourceId(active) === sourceId(s) ? 'true' : undefined}
                onClick={() => onSelect(s)}
              >
                <span className="t-keyword">{s.backend === 'storage' ? 'berglas://' : 'sm://'}</span>
                {s.parent}
              </button>
              <button onClick={() => onRemove(s)} aria-label={`remove ${s.parent}`}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={add}>
        <select aria-label="backend" value={backend} onChange={(e) => setBackend(e.target.value as Backend)}>
          <option value="storage">storage + kms</option>
          <option value="sm">secret manager</option>
        </select>
        <input
          aria-label={backend === 'storage' ? 'bucket name' : 'project id'}
          placeholder={backend === 'storage' ? 'bucket name' : 'project id'}
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">add</button>
        <span role="alert" className="t-error">
          {err}
        </span>
      </form>
      <div role="alert" className="t-error">
        {saveError && `error: ${saveError}`}
      </div>
      {configPath && <div className="muted small"># saved in {configPath}</div>}
    </div>
  )
}
