import type { LockState } from '../../../core/hooks/useLock'

/** Covers the window while locked; the page underneath keeps its state. */
export function LockScreen({ l }: { l: LockState }) {
  if (!l.locked) return null
  return (
    <div className="lock-screen" role="dialog" aria-label="locked" data-find-ignore>
      <div className="lock-card">
        <div className="lock-icon" aria-hidden>
          🔒
        </div>
        <strong>berglas-ui is locked</strong>
        <span className="muted small">{l.minutes ? `It locks after ${l.minutes} minutes without input.` : 'Locked by you.'}</span>
        {/* never disabled: WebKit draws a disabled button as a native control while the Touch ID sheet has focus */}
        <button className="btn primary" onClick={l.unlock} aria-busy={l.busy} autoFocus>
          {l.secure ? 'Unlock with Touch ID…' : 'Unlock'}
        </button>
        {l.busy && <span className="muted small">Waiting for Touch ID…</span>}
        {!l.secure && <span className="muted small">In a browser this only hides the screen.</span>}
        {l.error && <span className="bad-text small">{l.error}</span>}
      </div>
    </div>
  )
}
