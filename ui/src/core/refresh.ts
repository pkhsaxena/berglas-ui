// Re-checks what can go stale while the app sits open: the open secret's
// version list and the open source's secret list (names and times, never
// values). It runs when you come back to the window (it regains focus or
// becomes visible again) and when you click the secret that is already open,
// so a version someone else saved shows up without reopening anything.
// Coming back is throttled, so switching windows quickly does not repeat it;
// a click always refreshes.

export const REFRESH_MIN_MS = 5000

type Listener = () => void
const listeners = new Set<Listener>()
let last = 0

/** Runs `fn` on every refresh; returns a function that stops it. */
export function onRefresh(fn: Listener): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** Asks everything registered to re-check. Without `force`, at most once per REFRESH_MIN_MS. */
export function requestRefresh(force = false, now = Date.now()) {
  if (!force && now - last < REFRESH_MIN_MS) return
  last = now
  for (const fn of [...listeners]) fn()
}

/** Refreshes when the window regains focus or the page becomes visible; returns a function that stops it. */
export function refreshOnReturn(): () => void {
  const back = () => {
    if (document.visibilityState === 'visible') requestRefresh()
  }
  window.addEventListener('focus', back)
  document.addEventListener('visibilitychange', back)
  return () => {
    window.removeEventListener('focus', back)
    document.removeEventListener('visibilitychange', back)
  }
}

/** Forgets the throttle, for tests. */
export function resetRefresh() {
  last = 0
}
