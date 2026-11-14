import { useCallback, useEffect, useRef, useState } from 'react'
import { onCommand } from '../commands'
import { desktopAuthenticate, desktopCanAuthenticate } from '../desktop'

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
