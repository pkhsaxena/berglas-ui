import type { LinkTarget } from '../../../core/commands'

/** A berglas-ui:// link to a source that isn't in the config: add it, or not. */
export function LinkDialog({ target, onAdd, onCancel }: { target: LinkTarget; onAdd: () => void; onCancel: () => void }) {
  return (
    <div className="palette-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="drop-dialog" role="dialog" aria-label="open link">
        <h3>$ open {target.name}</h3>
        <div>
          the link points to <span className="t-string">{target.parent}</span> ({target.backend === 'storage' ? 'storage bucket' : 'secret manager project'}), which isn't one of your sources.
        </div>
        <div className="muted small"># adding it saves it to your config. links never reveal or change a secret.</div>
        <div className="drop-actions">
          <button className="primary" onClick={onAdd}>
            add source and open
          </button>
          <button onClick={onCancel}>cancel</button>
        </div>
      </div>
    </div>
  )
}
