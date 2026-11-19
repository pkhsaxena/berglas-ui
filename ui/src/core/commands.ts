// Commands the ui can be told to run from outside the page: the desktop app's
// menu items (View → Zoom, Find, Go → Settings…, Go → Set Up Sources…) call window.berglasUI.run(name).
// Whoever owns the state registers the handler; a command with no handler
// does nothing.

export type Command = 'zoomIn' | 'zoomOut' | 'zoomReset' | 'find' | 'findNext' | 'findPrev' | 'palette' | 'lock' | 'watchChanged' | 'settings' | 'setup' | 'shortcuts'

// a command runs its handler of the highest priority, the newest among
// equals; removing that one hands the command back to the next. The settings
// screen takes 'find' this way while it is open.
const handlers = new Map<Command, { fn: () => void; priority: number }[]>()

/** Registers a handler; returns a function that removes it. A higher `priority` wins over other handlers of the command. */
export function onCommand(c: Command, fn: () => void, priority = 0): () => void {
  const entry = { fn, priority }
  handlers.set(c, [...(handlers.get(c) ?? []), entry])
  return () => {
    handlers.set(
      c,
      (handlers.get(c) ?? []).filter((e) => e !== entry),
    )
  }
}

export function runCommand(c: Command) {
  const list = handlers.get(c) ?? []
  let best: (typeof list)[number] | undefined
  for (const e of list) if (!best || e.priority >= best.priority) best = e
  best?.fn()
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
