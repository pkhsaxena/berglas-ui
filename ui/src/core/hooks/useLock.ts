import { useCallback, useEffect, useRef, useState } from 'react'
import { onCommand } from '../commands'
import { desktopAuthenticate, desktopCanAuthenticate } from '../desktop'
import { useOverlay } from '../overlays'

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const

/**
 * Locks the ui: after `minutes` without input (0 = never), or on demand
 * (lock(), the 'lock' command). While locked, <html data-locked> lets the
 * skin hide everything but its lock screen; the page stays as it was
 * underneath, so an open editor keeps its draft. In the mac app unlocking
 * asks for Touch ID or the login password; in a browser there is nobody to
 * ask, so the lock only hides the screen.
 */
export function useLock(minutes: number) {
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const secure = desktopCanAuthenticate()

  const lock = useCallback(() => {
    setError('')
    setLocked(true)
  }, [])

  useEffect(() => onCommand('lock', lock), [lock])
  // over everything: nothing opens on top, and Esc doesn't unlock
  useOverlay('lock', 'lock', locked, { close: () => false, escape: () => {} })

  // ⌘L (Ctrl+L) locks. The mac app's Go → Lock has the same key and takes it
  // first; this is for the browser version, where the browser may keep ⌘L for
  // its address bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'l' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      e.preventDefault()
      lock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lock])

  useEffect(() => {
    if (locked) document.documentElement.dataset.locked = ''
    else delete document.documentElement.dataset.locked
  }, [locked])

  useEffect(() => {
    if (!minutes || locked) return
    const arm = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(lock, minutes * 60_000)
    }
    arm()
    for (const e of ACTIVITY) window.addEventListener(e, arm, { passive: true })
    return () => {
      window.clearTimeout(timer.current)
      for (const e of ACTIVITY) window.removeEventListener(e, arm)
    }
  }, [minutes, locked, lock])

  const unlock = async () => {
    if (busy) return // the prompt is already up
    if (!secure) return setLocked(false)
    setBusy(true)
    setError('')
    try {
      const r = await desktopAuthenticate('unlock berglas-ui')
      if (r.ok) setLocked(false)
      else setError(r.error || 'not unlocked')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return { locked, lock, unlock, secure, busy, error, minutes }
}

export type LockState = ReturnType<typeof useLock>
