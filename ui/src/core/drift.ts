// Key drift across one service's environments: which keys are missing where,
// which values match, and which prod values are the same as a non-prod one.
// Built from the core's fingerprints (api.drift), so no value is ever in the
// ui: equal fingerprints mean equal values, and that is all it knows.
import type { DriftSecret } from './api'
import { envTone } from './envtone'

/** One environment column: the secret for it, or null when the service has none there. */
export type DriftColumn = { env: string; name: string | null }

export type DriftCell =
  /** the environment has the secret but not this key */
  | { state: 'missing' }
  /** no secret for this environment, or it couldn't be read, or isn't a .env file */
  | { state: 'none' }
  /**
   * group: values with the same group number are equal (0 = the first value
   * seen, left to right). quotesOnly: equal to another cell in its group
   * except for surrounding quotes.
   */
  | { state: 'value'; group: number; empty: boolean; quotesOnly: boolean }

export type DriftKind = 'same' | 'differs' | 'missing'

export type DriftRow = {
  key: string
  cells: DriftCell[]
  kind: DriftKind
  /**
   * "prod = staging": prod has the same value as a non-prod environment while
   * the environments don't all agree (a likely copy); "empty in prod".
   */
  warnings: string[]
}

export type DriftColumnState = { env: string; name: string | null; version?: string; problem?: string }

export type DriftTable = {
  columns: DriftColumnState[]
  rows: DriftRow[]
  counts: { keys: number; same: number; differs: number; missing: number; warnings: number }
}

/**
 * The table for columns (left to right) given the core's answer for the
 * secrets in them. Keys are sorted A→Z. Only readable .env columns take part
 * in a row's kind; a row is 'missing' if any of them lacks the key.
 */
export function driftTable(columns: DriftColumn[], secrets: DriftSecret[]): DriftTable {
  const byName = new Map(secrets.map((s) => [s.name, s]))
  const cols: DriftColumnState[] = columns.map((c) => {
    const s = c.name ? byName.get(c.name) : undefined
    if (!c.name) return { env: c.env, name: null, problem: 'no secret' }
    if (!s) return { env: c.env, name: c.name, problem: 'not compared' }
    if (s.error) return { env: c.env, name: c.name, problem: s.error }
    if (!s.env) return { env: c.env, name: c.name, version: s.version, problem: 'not a .env file' }
    return { env: c.env, name: c.name, version: s.version }
  })
  const keyMaps = cols.map((c) => {
    if (c.problem || !c.name) return null
    return new Map((byName.get(c.name)!.keys ?? []).map((k) => [k.key, k]))
  })
  const allKeys = new Set<string>()
  for (const m of keyMaps) if (m) for (const k of m.keys()) allKeys.add(k)

  const rows: DriftRow[] = [...allKeys].sort((a, b) => a.localeCompare(b)).map((key) => {
    const groups: string[] = []
    const exacts = new Map<string, Set<string>>()
    const cells: DriftCell[] = keyMaps.map((m) => {
      if (!m) return { state: 'none' }
      const k = m.get(key)
      if (!k) return { state: 'missing' }
      let g = groups.indexOf(k.fp)
      if (g < 0) g = groups.push(k.fp) - 1
      const ex = exacts.get(k.fp) ?? new Set<string>()
      ex.add(k.exact)
      exacts.set(k.fp, ex)
      return { state: 'value', group: g, empty: !!k.empty, quotesOnly: false }
    })
    // a cell is quotes-only when its group holds more than one way of writing it
    keyMaps.forEach((m, i) => {
      const c = cells[i]
      if (m && c.state === 'value') c.quotesOnly = (exacts.get(groups[c.group])?.size ?? 0) > 1
    })
    const kind: DriftKind = cells.some((c) => c.state === 'missing') ? 'missing' : groups.length > 1 ? 'differs' : 'same'
    // letters go to non-empty values first (an empty one shows as ∅), so A is always shown
    const order = new Map<number, number>()
    for (const pass of [false, true])
      for (const c of cells) if (c.state === 'value' && c.empty === pass && !order.has(c.group)) order.set(c.group, order.size)
    for (const c of cells) if (c.state === 'value') c.group = order.get(c.group)!
    const warnings: string[] = []
    cells.forEach((c, i) => {
      if (c.state !== 'value' || envTone(cols[i].env) !== 'prod') return
      if (c.empty) warnings.push(`empty in ${cols[i].env}`)
      const twins = cells
        .map((o, j) => (j !== i && o.state === 'value' && o.group === c.group && !o.empty && envTone(cols[j].env) !== 'prod' ? cols[j].env : null))
        .filter((x): x is string => !!x)
      // a key equal everywhere is usually shared config, so only a prod
      // value that copies one environment while others differ is flagged
      if (twins.length && !c.empty && kind !== 'same') warnings.push(`${cols[i].env} = ${twins.join(', ')}`)
    })
    return { key, cells, kind, warnings }
  })

  return {
    columns: cols,
    rows,
    counts: {
      keys: rows.length,
      same: rows.filter((r) => r.kind === 'same').length,
      differs: rows.filter((r) => r.kind === 'differs').length,
      missing: rows.filter((r) => r.kind === 'missing').length,
      warnings: rows.filter((r) => r.warnings.length).length,
    },
  }
}

/** A, B, C… for value groups; past Z, A2, B2… */
export const groupLabel = (g: number) => String.fromCharCode(65 + (g % 26)) + (g >= 26 ? String(Math.floor(g / 26) + 1) : '')
