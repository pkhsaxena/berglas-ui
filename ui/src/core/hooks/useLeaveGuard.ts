import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keeps unsaved work from being dropped silently. The editor and the create
 * form say what they hold (`setDirty('your changes to orders-dev-env')`, or
 * null once saved, cancelled or unchanged); every way of moving elsewhere
 * (another secret, another source, a view, ⌘K, a link, a dropped file) runs
 * through `guard`, which asks first while something is unsaved. Reloading or
 * closing a browser tab asks too.
 */
export function useLeaveGuard() {
  const [dirty, setDirtyState] = useState<string | null>(null)
  const dirtyRef = useRef<string | null>(null)
  const [pending, setPending] = useState<{ run: () => void } | null>(null)

  const setDirty = useCallback((what: string | null) => {
    dirtyRef.current = what
    setDirtyState(what)
  }, [])

  /** Runs `fn` now, or after the person agrees to discard what is unsaved. */
  const guard = useCallback((fn: () => void) => {
    if (!dirtyRef.current) return fn()
    setPending({ run: fn })
  }, [])

  /** Drops the unsaved work and carries on with what was asked. */
  const discard = () => {
    const p = pending
    setPending(null)
    setDirty(null)
    p?.run()
  }

  /** Stays with the unsaved work; what was asked does not happen. */
  const keep = () => setPending(null)

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  return { dirty, setDirty, guard, asking: pending !== null, discard, keep }
}

export type LeaveGuard = ReturnType<typeof useLeaveGuard>
