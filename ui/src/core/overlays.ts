import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * The overlays over the app, so they never pile up by accident and Esc
 * always reaches the top one.
 *
 * - 'panel': the palette, the shortcut sheet, settings, the setup guide and
 *   the link and file-drop dialogs. One at a time: opening one calls
 *   claim(), which asks each open panel to close. A panel that won't close
 *   yet (settings with unsaved safety edits asks first) stays, and the new
 *   one doesn't open.
 * - 'question': the unsaved-changes question. It goes over whatever asked
 *   it and closes nothing; no panel opens until it is answered.
 * - 'lock': the lock screen. It hides the rest, and no panel opens under it.
 *
 * Esc that nothing handled (no field, list or dialog took it, as when a
 * click on a dialog's text moved the focus out to the page) goes to the
 * overlay opened last.
 */
export type OverlayKind = 'panel' | 'question' | 'lock'

type Entry = { id: string; kind: OverlayKind; close: () => boolean; escape: () => void }

// the open overlays, oldest first
const stack: Entry[] = []

/**
 * Makes room for panel `id`: closes every other open panel. false when one
 * won't close yet, or a question or the lock screen is up; `id` should not
 * open then.
 */
export function claim(id: string): boolean {
  if (stack.some((e) => e.kind !== 'panel')) return false
  for (const e of [...stack]) {
    if (e.kind === 'panel' && e.id !== id && !e.close()) return false
  }
  return true
}

/** The open overlays' ids, oldest first (for tests). */
export function openOverlays(): string[] {
  return stack.map((e) => e.id)
}

/** What Esc does when it reaches the page unhandled: it goes to the top overlay. */
export function escapeTop(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.escape()
  return true
}

let listening = false
function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  // on document, so it runs after the dialogs' own handlers (a handled Esc stops
  // there) and before window listeners such as hiding a revealed value
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
    if (escapeTop()) {
      e.preventDefault()
      e.stopPropagation()
    }
  })
}

/**
 * Puts an overlay on the stack while `open`. `close` returns false when it
 * didn't close (it asks first); `escape` is what Esc does, `close` if not given.
 */
export function useOverlay(id: string, kind: OverlayKind, open: boolean, handlers: { close: () => boolean | void; escape?: () => void }) {
  const ref = useRef(handlers)
  useLayoutEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    if (!open) return
    listen()
    const e: Entry = {
      id,
      kind,
      close: () => ref.current.close() !== false,
      escape: () => (ref.current.escape ?? ref.current.close)(),
    }
    stack.push(e)
    return () => {
      const i = stack.indexOf(e)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [id, kind, open])
}
