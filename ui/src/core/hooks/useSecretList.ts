import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Secret } from '../api'
import type { Source } from '../sources'
import { errText } from './useApp'

/** Lists the secrets in one source (names and metadata, never values) with a name filter. */
export function useSecretList(source: Source | null, enabled: boolean) {
  const [secrets, setSecrets] = useState<Secret[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const refresh = useCallback(async () => {
    if (!source) return
    setLoading(true)
    setError('')
    try {
      const list = await api.list(source.backend, source.parent)
      setSecrets(list.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      setSecrets(null)
      setError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [source])

  // Callers key the component using this hook by source, so state starts
  // fresh when the source changes.
  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (secrets ?? []).filter((s) => s.name.toLowerCase().includes(f))
  }, [secrets, filter])

  return { secrets, shown, loading, error, filter, setFilter, refresh }
}
