import { useState } from 'react'
import type { Backend } from '../../../core/api'
import { type Source, sourceId } from '../../../core/sources'

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

export function Sources({ sources, configPath, saveError, active, onSelect, onAdd, onRemove }: Props) {
  const [backend, setBackend] = useState<Backend>('storage')
  const [parent, setParent] = useState('')
  const [err, setErr] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = onAdd({ backend, parent })
    setErr(msg)
    if (!msg) setParent('')
  }

  return (
    <div className="card pane sources-pane">
      <h2>
        sources <span className="muted">— where to scan for secrets</span>
      </h2>
      <div className="body">
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
                  {s.label && <span style={{ marginRight: '1ch' }}>{s.label}</span>}
                  <span className={s.label ? 'muted' : undefined}>
                    <span className={s.label ? undefined : 't-keyword'}>{s.backend === 'storage' ? 'berglas://' : 'sm://'}</span>
                    {s.parent}
                  </span>
                  {s.readOnly && <span className="muted small"> · read-only</span>}
                  {s.default && <span className="muted small"> · default</span>}
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
    </div>
  )
}
