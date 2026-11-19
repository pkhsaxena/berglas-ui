import type { Shortcuts } from '../../../core/hooks/useShortcuts'

/** `?`: every keyboard shortcut, grouped. */
export function ShortcutSheet({ s }: { s: Shortcuts }) {
  if (!s.open) return null
  return (
    <div className="palette-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && s.close()}>
      <div
        className="drop-dialog shortcut-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="keyboard shortcuts"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            s.close()
          }
        }}
      >
        <div className="row" style={{ margin: 0 }}>
          <h3 style={{ margin: 0 }}>Keyboard shortcuts</h3>
          <span className="spacer" />
          <button className="btn" onClick={s.close}>
            Done
          </button>
        </div>
        {s.groups.map((g) => (
          <section key={g.title}>
            <h4>
              {g.title}
              {g.desktopOnly && !s.desktop && <span className="muted small"> · in the mac app only (its menus)</span>}
            </h4>
            <dl>
              {g.items.map((i) => (
                <div key={i.what + i.keys.join()} className="shortcut-row">
                  <dt>
                    {i.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{i.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
