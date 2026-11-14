import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { type DriftColumn, type DriftTable, driftTable } from '../drift'
import type { Matrix } from '../overview'
import { type Source, sourceId } from '../sources'
import { errText } from './useApp'

/** The services (matrix rows) that have at least two environments to compare. */
export const driftServices = (m: Matrix | null) => (m ? m.rows.filter((r) => r.cells.filter(Boolean).length >= 2).map((r) => r.key) : [])

/**
 * Key drift for one service of the open source: pick a service, then run()
 * asks the core for fingerprints of that service's secrets (one per matrix
 * column) and builds the table. Nothing is fetched until run(), since it
 * decrypts every one of those secrets. Switching source clears it.
 */
export function useDrift(source: Source | null, matrix: Matrix | null) {
  const id = source ? sourceId(source) : ''
  const [service, setServiceState] = useState<string | null>(null)
  const [table, setTable] = useState<{ id: string; service: string; table: DriftTable } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setServiceState(null)
    setTable(null)
    setError('')
  }, [id])

  const columnsFor = useCallback(
    (svc: string): DriftColumn[] | null => {
      const row = matrix?.rows.find((r) => r.key === svc)
      return row && matrix ? matrix.cols.map((env, i) => ({ env, name: row.cells[i]?.name ?? null })) : null
    },
    [matrix],
  )

  const run = useCallback(
    async (svc: string) => {
      if (!source) return
      const cols = columnsFor(svc)
      setServiceState(svc)
      setError('')
      if (!cols) return setError(`no ${svc} in the matrix`)
      const names = cols.map((c) => c.name).filter((n): n is string => !!n)
      setLoading(true)
      try {
        const secrets = await api.drift(source.backend, source.parent, names)
        setTable({ id: sourceId(source), service: svc, table: driftTable(cols, secrets) })
      } catch (e) {
        setError(`couldn't compare ${svc} — ${errText(e)}`)
      } finally {
        setLoading(false)
      }
    },
    [source, columnsFor],
  )

  /** Picks a service without comparing; clears a table for another service. */
  const setService = (svc: string) => {
    setServiceState(svc)
    setError('')
    if (table?.service !== svc) setTable(null)
  }

  const shown = table && table.id === id && table.service === service ? table.table : null
  return { services: driftServices(matrix), service, setService, run, table: shown, loading, error }
}

export type DriftState = ReturnType<typeof useDrift>
