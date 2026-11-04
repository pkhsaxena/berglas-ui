import { useCallback, useEffect, useRef, useState } from 'react'
import { type Ref, type Secret, versionOf } from '../api'
import { type Diff, diffValues } from '../diff'
import { useSettings } from '../settings'
import { errText } from './useApp'
import { readValue, scheduleHide } from './useSecret'

export type VersionDiff = Diff & { from: Secret; to: Secret }

/**
 * Compares two versions of one secret. Showing a diff shows values, so like a
 * reveal it is cleared after the revealSeconds setting, on clear() and on unmount.
 */
export function useVersionDiff(base: Ref, versions: Secret[] | null) {
  const settings = useSettings()
  // default: the version before the latest → the latest
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<VersionDiff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const fromId = from || (versions && versions.length > 1 ? versionOf(versions[1]) : '')
  const toId = to || (versions?.[0] ? versionOf(versions[0]) : '')

  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setResult(null)
  }, [])

  useEffect(() => clear, [clear])

  const pick = (side: 'from' | 'to', id: string) => {
    clear()
    setError('')
    if (side === 'from') setFrom(id)
    else setTo(id)
  }

  const run = async () => {
    const a = versions?.find((v) => versionOf(v) === fromId)
    const b = versions?.find((v) => versionOf(v) === toId)
    if (!a || !b) return setError('pick two versions')
    if (fromId === toId) return setError('pick two different versions')
    setBusy(true)
    setError('')
    try {
      const [va, vb] = await Promise.all([readValue({ ...base, version: fromId }), readValue({ ...base, version: toId })])
      if (va.value.text === null || vb.value.text === null) throw new Error('one of the versions is binary — only text can be diffed')
      setResult({ ...diffValues(va.value.text, vb.value.text, !!va.value.env && !!vb.value.env), from: a, to: b })
      window.clearTimeout(timer.current)
      timer.current = scheduleHide(settings.revealSeconds, () => setResult(null))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return { fromId, toId, pick, run, result, clear, busy, error, canDiff: (versions?.length ?? 0) > 1 }
}
