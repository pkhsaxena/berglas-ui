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
        <strong>$ berglas-ui is locked</strong>
        <span className="muted small">{l.minutes ? `# locks after ${l.minutes} min without input` : '# locked by you'}</span>
        {/* never disabled: WebKit draws a disabled button as a native control while the Touch ID sheet has focus */}
        <button className="primary" onClick={l.unlock} aria-busy={l.busy} autoFocus>
          {l.secure ? 'unlock with touch id…' : 'unlock'}
        </button>
        {l.busy && <span className="muted small"># waiting for touch id…</span>}
        {!l.secure && <span className="muted small"># in a browser this only hides the screen</span>}
        {l.error && <span className="t-error small">{l.error}</span>}
      </div>
    </div>
  )
}
