import type { FileDropState } from '../../../core/hooks/useFileDrop'

type Props = {
  drop: FileDropState
  /** the open secret, when its value can be replaced */
  replaceTarget: string | null
  /** where a new secret would go, when the source takes writes */
  createIn: string | null
  onReplace: () => void
  onCreate: () => void
}

const size = (n: number) => (n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`)

/** While dragging a file: a drop hint. After a drop: replace the open secret's value, or create one. */
export function FileDrop({ drop, replaceTarget, createIn, onReplace, onCreate }: Props) {
  if (drop.dragging)
    return (
      <div className="drop-overlay" data-find-ignore>
        <div className="drop-hint">
          <strong>$ drop a file to use it as a secret value</strong>
          <span className="muted"># nothing is saved until you review it</span>
        </div>
      </div>
    )
  const f = drop.dropped
  if (!f && !drop.error) return null
  return (
    <div className="palette-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && drop.clear()}>
      <div className="drop-dialog" role="dialog" aria-label="dropped file">
        {f ? (
          <>
            <h3>{f.name}</h3>
            <div className="muted small">{f.keys !== null ? `.env file · ${f.keys} keys · ${size(f.size)}` : `text · ${size(f.size)}`}</div>
            <div className="drop-actions">
              {replaceTarget && (
                <button className="primary" onClick={onReplace}>
                  replace the value of {replaceTarget}…
                </button>
              )}
              {createIn && (
                <button onClick={onCreate}>
                  new secret in {createIn}…
                </button>
              )}
              <button onClick={drop.clear}>
                cancel
              </button>
            </div>
            {!replaceTarget && !createIn && <div className="t-string small"># this source is read-only, so a file can't be used here</div>}
            <div className="muted small"># nothing is saved yet: the editor shows the change for review before anything is written</div>
          </>
        ) : (
          <>
            <div className="t-error">{drop.error}</div>
            <div className="drop-actions">
              <button onClick={drop.clear}>
                ok
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
