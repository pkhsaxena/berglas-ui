import type { LinkTarget } from '../../../core/commands'

/** A berglas-ui:// link to a source that isn't in the config: add it, or not. */
export function LinkDialog({ target, onAdd, onCancel }: { target: LinkTarget; onAdd: () => void; onCancel: () => void }) {
  return (
    <div className="palette-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="drop-dialog" role="dialog" aria-label="open link">
        <h3>Open {target.name}?</h3>
        <div>
          The link points to <span className="mono">{target.parent}</span> ({target.backend === 'storage' ? 'Storage bucket' : 'Secret Manager project'}), which isn't one of your sources.
        </div>
        <div className="muted small">Adding it saves it to your config. Links never reveal or change a secret.</div>
        <div className="drop-actions">
          <button className="btn primary" onClick={onAdd}>
            Add source and open
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
