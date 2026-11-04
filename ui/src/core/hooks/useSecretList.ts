import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Secret } from '../api'
import { groupByPattern } from '../group'
import { type Source, sourceId } from '../sources'
import { errText } from './useApp'

/**
 * Lists the secrets in one source (names and metadata, never values) with a
 * name filter. Bump `rev` to reload, e.g. after a create or delete. Loaded
 * data is tagged with its source, so switching sources never shows the old
 * source's list.
 */
export function useSecretList(source: Source | null, enabled: boolean, rev = 0) {
  const id = source ? sourceId(source) : ''
  const [data, setData] = useState<{ id: string; list: Secret[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [filter, setFilter] = useState('')

  const refresh = useCallback(async () => {
    if (!source) return
    const forId = sourceId(source)
    setLoading(true)
    setError(null)
    try {
      const list = await api.list(source.backend, source.parent)
      setData({ id: forId, list: list.sort((a, b) => a.name.localeCompare(b.name)) })
    } catch (e) {
      setError({ id: forId, message: errText(e) })
    } finally {
      setLoading(false)
    }
    // rev is a dependency so bumping it reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, rev])

  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  const secrets = data?.id === id ? data.list : null

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (secrets ?? []).filter((s) => s.name.toLowerCase().includes(f))
  }, [secrets, filter])

  /** shown, grouped by the source's group pattern; one unkeyed group when it has none */
  const pattern = source?.group
  const groups = useMemo(
    () => (pattern ? groupByPattern(shown, (s) => s.name, pattern) : [{ key: null, items: shown.map((item) => ({ item, label: item.name })) }]),
    [shown, pattern],
  )

  return {
    secrets,
    shown,
    groups,
    loading,
    error: error?.id === id ? error.message : '',
    filter,
    setFilter,
    refresh,
  }
}

export type SecretListState = ReturnType<typeof useSecretList>
