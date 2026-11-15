import { useCallback, useEffect, useState } from 'react'
import { api, type SecretRef, type WatchChange } from '../api'
import { onCommand } from '../commands'
import { refKey } from '../refs'

/**
 * Changes to watched secrets, as the core found them. The core checks
 * Google every watchMinutes; this only reads the core's list, every minute
 * and when the mac app says something changed. Opening a secret clears its
 * change (ack).
 */
export function useWatch(watched: SecretRef[], enabled: boolean) {
  const [changes, setChanges] = useState<WatchChange[]>([])
  const any = enabled && watched.length > 0

  const load = useCallback(() => {
    api.watchChanges().then((r) => setChanges(r.changes ?? []), () => {})
  }, [])

  useEffect(() => {
    if (!any) return
    load()
    const t = window.setInterval(load, 60_000)
    const off = onCommand('watchChanged', load)
    return () => {
      window.clearInterval(t)
      off()
    }
  }, [any, load])

  const ack = useCallback((r: SecretRef) => {
    setChanges((cs) => {
      if (!cs.some((c) => refKey(c) === refKey(r))) return cs
      void api.watchAck(r).catch(() => {})
      return cs.filter((c) => refKey(c) !== refKey(r))
    })
  }, [])

  /** Checks now instead of waiting for the next round. */
  const checkNow = useCallback(async () => {
    await api.watchCheck().catch(() => {})
    load()
  }, [load])

  return { changes, ack, checkNow, changed: (r: SecretRef) => changes.find((c) => refKey(c) === refKey(r)) }
}

export type WatchState = ReturnType<typeof useWatch>
