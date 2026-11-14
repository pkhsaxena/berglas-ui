import { useCallback, useEffect, useRef, useState } from 'react'
import { type Ref, refString, type Secret } from '../api'
import { type Diff, diffValues } from '../diff'
import { useSettings } from '../settings'
import { errText } from './useApp'
import { readValue, type Revealed, scheduleHide } from './useSecret'

/**
 * A revealed value kept on screen while other secrets are opened, to compare
 * or copy from. Unlike a reveal it does not hide on a timer: it stays until
 * unpinned, because comparing takes longer than a glance.
 */
export type Pinned = {
  /** includes the pinned version */
  ref: Ref
  secret: Secret
  value: Revealed
}

export const pinnedId = (p: Pinned) => refString(p.ref)

export function usePinned() {
  const [pinned, setPinned] = useState<Pinned | null>(null)
  return { pinned, pin: setPinned, unpin: () => setPinned(null) }
}

export type Comparison = Diff & { current: Secret }

/**
 * Compares the pinned value with the latest version of another secret.
 * Showing the result shows values, so it hides after revealSeconds like a
 * diff. Key the component using this by pinned + other secret so it resets.
 */
/** `otherLatestId` is the other secret's newest version id when known fresh, so the read can use the core's prefetched copy. */
export function useCompare(pinned: Pinned, other: Ref | null, otherLatestId?: string) {
  const { revealSeconds } = useSettings()
  const [result, setResult] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setResult(null)
  }, [])

  useEffect(() => clear, [clear])

  const run = async () => {
    if (!other) return
    if (pinned.value.text === null) return setError('the pinned value is binary — only text can be compared')
    setBusy(true)
    setError('')
    try {
      const cur = await readValue({ ...other, version: otherLatestId })
      if (cur.value.text === null) throw new Error(`${other.name} is binary — only text can be compared`)
      setResult({ ...diffValues(pinned.value.text, cur.value.text, !!pinned.value.env && !!cur.value.env), current: cur.secret })
      window.clearTimeout(timer.current)
      timer.current = scheduleHide(revealSeconds, () => setResult(null))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return { result, run, clear, busy, error }
}
