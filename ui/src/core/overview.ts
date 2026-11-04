// Facts about a whole source, computed from list metadata only (names,
// update times, generations, kms keys), so nothing is decrypted.
import { type Secret } from './api'
import { compileGroup } from './group'

const DAY = 86_400_000

/** Secrets not changed for this long count as stale. */
export const STALE_DAYS = 180

export type Matrix = {
  /** e.g. the {env} values, in a sensible order */
  cols: string[]
  /** e.g. one row per {service}; cells line up with cols */
  rows: { key: string; cells: (Secret | null)[] }[]
}

export type Overview = {
  count: number
  newest: Secret | null
  changed7d: number
  changed30d: number
  /** not changed in STALE_DAYS, oldest first */
  stale: Secret[]
  /** most recently changed first */
  recent: Secret[]
  /** distinct kms keys and how many secrets use each (storage only) */
  kmsKeys: { key: string; count: number }[]
  /** set when the group pattern has two or more placeholders */
  matrix: Matrix | null
}

const ENV_ORDER = ['dev', 'development', 'test', 'qa', 'stage', 'staging', 'nonprod', 'non-prod', 'uat', 'preprod', 'prod', 'production']

function envRank(a: string, b: string): number {
  const ia = ENV_ORDER.indexOf(a.toLowerCase())
  const ib = ENV_ORDER.indexOf(b.toLowerCase())
  if (ia >= 0 && ib >= 0) return ia - ib
  if (ia >= 0) return -1
  if (ib >= 0) return 1
  return a.localeCompare(b)
}

const time = (s: Secret) => Date.parse(s.updatedAt) || 0

/** A matrix of first × second placeholder, e.g. service × env. */
export function matrixOf(secrets: Secret[], pattern: string | undefined): Matrix | null {
  const c = pattern ? compileGroup(pattern) : null
  if (!c || c.names.length < 2) return null
  const cells = new Map<string, Map<string, Secret>>()
  const cols = new Set<string>()
  for (const s of secrets) {
    const m = c.re.exec(s.name)
    if (!m) continue
    cols.add(m[2])
    const row = cells.get(m[1]) ?? new Map<string, Secret>()
    row.set(m[2], s)
    cells.set(m[1], row)
  }
  if (cells.size === 0) return null
  const colList = [...cols].sort(envRank)
  return {
    cols: colList,
    rows: [...cells.keys()].sort((a, b) => a.localeCompare(b)).map((key) => ({ key, cells: colList.map((col) => cells.get(key)!.get(col) ?? null) })),
  }
}

export function overview(secrets: Secret[], groupPattern: string | undefined, now = Date.now()): Overview {
  const byNew = [...secrets].sort((a, b) => time(b) - time(a))
  const age = (s: Secret) => now - time(s)
  const keys = new Map<string, number>()
  for (const s of secrets) if (s.kmsKey) keys.set(s.kmsKey, (keys.get(s.kmsKey) ?? 0) + 1)
  return {
    count: secrets.length,
    newest: byNew[0] ?? null,
    changed7d: secrets.filter((s) => age(s) <= 7 * DAY).length,
    changed30d: secrets.filter((s) => age(s) <= 30 * DAY).length,
    stale: byNew.filter((s) => age(s) > STALE_DAYS * DAY).reverse(),
    recent: byNew.slice(0, 8),
    kmsKeys: [...keys.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    matrix: matrixOf(secrets, groupPattern),
  }
}
