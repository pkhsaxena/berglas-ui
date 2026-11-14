// Commands the ui can be told to run from outside the page: the desktop app's
// menu items (View → Zoom, Edit → Find) call window.berglasUI.run(name).
// Whoever owns the state registers the handler; a command with no handler
// does nothing.

export type Command = 'zoomIn' | 'zoomOut' | 'zoomReset' | 'find' | 'findNext' | 'findPrev' | 'palette'

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

declare global {
  interface Window {
    berglasUI?: { run: (c: Command) => void }
  }
}

if (typeof window !== 'undefined') window.berglasUI = { run: runCommand }
