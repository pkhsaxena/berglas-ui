// Commands the ui can be told to run from outside the page: the desktop app's
// menu items (View → Zoom, Edit → Find) call window.berglasUI.run(name).
// Whoever owns the state registers the handler; a command with no handler
// does nothing.

export type Command = 'zoomIn' | 'zoomOut' | 'zoomReset' | 'find' | 'findNext' | 'findPrev' | 'palette' | 'lock' | 'watchChanged'

const handlers = new Map<Command, () => void>()

/** Registers a handler; returns a function that removes it. */
export function onCommand(c: Command, fn: () => void): () => void {
  handlers.set(c, fn)
  return () => {
    if (handlers.get(c) === fn) handlers.delete(c)
  }
}

export function runCommand(c: Command) {
  handlers.get(c)?.()
}

/** A secret named by a berglas-ui:// link (the app has already checked it). */
export type LinkTarget = { backend: 'storage' | 'sm'; parent: string; name: string }

let linkHandler: ((t: LinkTarget) => void) | null = null
const waitingLinks: LinkTarget[] = []

/** Handles deep links; links that came in before a handler existed are handed over now. */
export function onOpenLink(fn: (t: LinkTarget) => void): () => void {
  linkHandler = fn
  while (waitingLinks.length) fn(waitingLinks.shift()!)
  return () => {
    if (linkHandler === fn) linkHandler = null
  }
}

/** Delivers a link to the handler, or queues it until one registers (window.berglasUI.openLink). */
export function openLink(t: LinkTarget) {
  if (!t || (t.backend !== 'storage' && t.backend !== 'sm') || typeof t.parent !== 'string' || typeof t.name !== 'string') return
  const clean = { backend: t.backend, parent: t.parent, name: t.name }
  if (linkHandler) linkHandler(clean)
  else waitingLinks.push(clean)
}

declare global {
  interface Window {
    berglasUI?: { run: (c: Command) => void; openLink: (t: LinkTarget) => void }
  }
}

if (typeof window !== 'undefined') window.berglasUI = { run: runCommand, openLink }
