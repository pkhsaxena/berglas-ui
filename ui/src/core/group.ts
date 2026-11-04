// Groups secret names by a pattern such as "{service}-{env}-env". The first
// placeholder is the group; the others label each row. The first
// placeholder takes as much as it can, so "a-b-dev-env" gives service "a-b"
// and env "dev"; later ones take as little as they can.

export type Grouped<T> = { key: string | null; items: { item: T; label: string }[] }[]

type Compiled = { re: RegExp; names: string[] }

export function compileGroup(pattern: string): Compiled | null {
  const names: string[] = []
  let re = ''
  let last = 0
  for (const m of pattern.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    re += pattern.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re += names.length === 0 ? '(.+)' : '(.+?)'
    names.push(m[1])
    last = m.index! + m[0].length
  }
  if (names.length === 0) return null
  re += pattern.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return { re: new RegExp(`^${re}$`), names }
}

/**
 * Groups items by the pattern's first placeholder, groups sorted by key and
 * items kept in input order. Names that do not match go in a last group with
 * key null and are labelled with their full name.
 */
export function groupByPattern<T>(items: T[], nameOf: (t: T) => string, pattern: string): Grouped<T> {
  const c = compileGroup(pattern)
  if (!c) return [{ key: null, items: items.map((item) => ({ item, label: nameOf(item) })) }]
  const groups = new Map<string, { item: T; label: string }[]>()
  const other: { item: T; label: string }[] = []
  for (const item of items) {
    const m = c.re.exec(nameOf(item))
    if (!m) {
      other.push({ item, label: nameOf(item) })
      continue
    }
    const rest = m.slice(2).join(' · ')
    const list = groups.get(m[1]) ?? []
    list.push({ item, label: rest || nameOf(item) })
    groups.set(m[1], list)
  }
  const out: Grouped<T> = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }))
  if (other.length) out.push({ key: null, items: other })
  return out
}
