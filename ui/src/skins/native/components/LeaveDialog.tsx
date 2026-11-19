import type { LeaveGuard } from '../../../core/hooks/useLeaveGuard'

/** Asked before moving away from unsaved work: keep editing (the default) or discard it. */
export function LeaveDialog({ g }: { g: LeaveGuard }) {
  if (!g.asking) return null
  return (
    <div className="palette-backdrop dialog-backdrop leave-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && g.keep()}>
      <div
        className="drop-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="discard unsaved changes"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            g.keep()
          }
        }}
      >
        <h3>Discard unsaved changes?</h3>
        <div>{g.dirty ? `You have ${g.dirty} that aren't saved.` : 'You have changes that aren’t saved.'} Leaving now drops them; nothing has been written.</div>
        <div className="drop-actions">
          <button className="btn primary" onClick={g.keep} autoFocus>
            Keep editing
          </button>
          <button className="btn danger" onClick={g.discard}>
            Discard changes
          </button>
        </div>
      </div>
    </div>
  )
}
