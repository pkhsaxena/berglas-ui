import { useCallback, useEffect, useRef, useState } from 'react'
import { type Ref, refString, type Secret } from '../api'
import { type Diff, diffValues } from '../diff'
import { copySecret } from '../clipboard'
import { useSettings } from '../settings'
import { errText } from './useApp'
import { readValue, type Revealed, scheduleHide } from './useSecret'

/**
 * A secret version kept on screen while other secrets are opened, to compare
 * or copy from. It can be pinned without revealing it: then `value` is null
 * until revealed in the pinned pane. Once shown, the value does not hide on a
 * timer: it stays until hidden or unpinned, because comparing takes longer
 * than a glance.
 */
export type Pinned = {
  /** includes the pinned version */
  ref: Ref
  secret: Secret
  value: Revealed | null
}

export const pinnedId = (p: Pinned) => refString(p.ref)

export function usePinned() {
  const [pinned, setPinned] = useState<Pinned | null>(null)
  /** shows the value of a pin made without revealing; ignored if that pin is gone */
  const setPinnedValue = useCallback((p: Pinned, value: Revealed) => {
    setPinned((cur) => (cur && pinnedId(cur) === pinnedId(p) ? { ...cur, value } : cur))
  }, [])
  /** masks a pin's value again, as if pinned without revealing; ignored if that pin is gone */
  const clearPinnedValue = useCallback((p: Pinned) => {
    setPinned((cur) => (cur && pinnedId(cur) === pinnedId(p) ? { ...cur, value: null } : cur))
  }, [])
  return { pinned, pin: setPinned, unpin: () => setPinned(null), setPinnedValue, clearPinnedValue }
}

/**
 * The pinned pane's own Reveal, Hide and Copy value. Reveal decrypts the
 * pinned version; Hide masks it again; Copy decrypts it if still hidden.
 */
export function usePinnedPane(pinned: Pinned, onValue: (p: Pinned, value: Revealed) => void, onHide: (p: Pinned) => void, onNote: (msg: string) => void) {
  const settings = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reveal = async () => {
    setBusy(true)
    setError('')
    try {
      onValue(pinned, (await readValue(pinned.ref)).value)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    setBusy(true)
    setError('')
    try {
      const value = pinned.value ?? (await readValue(pinned.ref)).value
      if (value.text === null) throw new Error('binary value — it cannot be copied as text')
      await copySecret(value.text, settings.clipboardClearSeconds, onNote)
      onNote(settings.clipboardClearSeconds > 0 ? `Copied · clears in ${settings.clipboardClearSeconds}s` : 'Copied')
    } catch (e) {
      setError(`couldn't copy — ${errText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return { reveal, hide: () => onHide(pinned), copy, busy, error }
}

export type Comparison = Diff & { current: Secret }

/**
 * Compares the pinned value with the latest version of another secret.
 * Showing the result shows values, so it hides after revealSeconds like a
 * diff. Key the component using this by pinned + other secret so it resets.
 *
 * Only the diff is shown: a hidden pin and the open secret are decrypted for
 * it, but neither pane reveals its value. `otherLatestId` is the other
 * secret's newest version id when known fresh, so the read can use the
 * core's prefetched copy.
 */
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
    if (pinned.value && pinned.value.text === null) return setError('the pinned value is binary — only text can be compared')
    setBusy(true)
    setError('')
    try {
      const [pin, cur] = await Promise.all([pinned.value ?? readValue(pinned.ref).then((r) => r.value), readValue({ ...other, version: otherLatestId })])
      if (pin.text === null) throw new Error(`the pinned ${pinned.ref.name} is binary — only text can be compared`)
      if (cur.value.text === null) throw new Error(`${other.name} is binary — only text can be compared`)
      setResult({ ...diffValues(pin.text, cur.value.text, !!pin.env && !!cur.value.env), current: cur.secret })
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
