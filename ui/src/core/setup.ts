// The first-run setup: what a fresh install needs before it is useful
// (sources, how their names group, which names are protected), worked out
// from the rows a person types or pastes and from the names a source holds.
// Holds no markup and calls no api; useSetup drives it and skins draw it.

import type { Backend } from './api'
import { compileGroup } from './group'
import { globToRegExp } from './settings'
import { type Source, sourceId } from './sources'

/** One source being set up. `key` only tells rows apart on screen. */
export type SetupRow = {
  key: number
  backend: Backend
  parent: string
  label: string
  group: string
  kmsKey: string
  readOnly: boolean
}

/** Name patterns offered for grouping; the first placeholder is the group. */
export const GROUP_PRESETS = ['{service}-{env}-env', '{service}-{env}', '{service}_{env}', '{service}/{env}'] as const

const KMS_KEY = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/

/**
 * Reads pasted lines into sources: `berglas://bucket`, `gs://bucket`,
 * `sm://project`, `projects/project`, or a bare name taken as `fallback`.
 * A path after the bucket or project is dropped. Blank lines and `#`
 * comments are skipped; commas and spaces also separate entries.
 */
export function parseSourceLines(text: string, fallback: Backend): { backend: Backend; parent: string }[] {
  const out: { backend: Backend; parent: string }[] = []
  for (const raw of text.split(/[\n,]+/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    for (const word of line.split(/\s+/)) {
      let backend = fallback
      let rest = word
      const m = /^(berglas|gs|sm):\/\/(.*)$/i.exec(word)
      if (m) {
        backend = m[1].toLowerCase() === 'sm' ? 'sm' : 'storage'
        rest = m[2]
      } else if (word.startsWith('projects/')) {
        backend = 'sm'
        rest = word.slice('projects/'.length)
      }
      const parent = rest.split('/')[0].trim()
      if (parent) out.push({ backend, parent })
    }
  }
  return out
}

/** What is wrong with a row, or '' when it can be saved. `taken` are ids already configured or on an earlier row. */
export function rowError(r: SetupRow, taken: Set<string>): string {
  const parent = r.parent.trim()
  if (!parent) return r.backend === 'storage' ? 'enter a bucket name' : 'enter a project id'
  if (/[\s/]/.test(parent)) return 'no spaces or slashes — just the bucket or project id'
  if (taken.has(sourceId({ backend: r.backend, parent }))) return 'already added'
  if (r.group.trim() && !compileGroup(r.group.trim())) return 'a group pattern needs a {placeholder}, like {service}-{env}'
  if (r.kmsKey.trim() && !KMS_KEY.test(r.kmsKey.trim())) return 'a kms key looks like projects/…/locations/…/keyRings/…/cryptoKeys/…'
  return ''
}

/** Each row's error, in order; a row repeating an earlier one is "already added". */
export function rowErrors(rows: SetupRow[], existing: Source[]): string[] {
  const taken = new Set(existing.map(sourceId))
  return rows.map((r) => {
    const err = rowError(r, taken)
    if (!err) taken.add(sourceId({ backend: r.backend, parent: r.parent.trim() }))
    return err
  })
}

/** The row as it is saved in the config: trimmed, empty fields left out. */
export function toSource(r: SetupRow): Source {
  const s: Source = { backend: r.backend, parent: r.parent.trim() }
  if (r.label.trim()) s.label = r.label.trim()
  if (r.group.trim()) s.group = r.group.trim()
  if (r.kmsKey.trim() && r.backend === 'storage') s.kmsKey = r.kmsKey.trim()
  if (r.readOnly) s.readOnly = true
  return s
}

/** How a group pattern fits a source's names: how many match, and the groups and the second placeholder's values. */
export type GroupFit = { pattern: string; matched: number; total: number; groups: string[]; envs: string[] }

export function groupFit(pattern: string, names: string[]): GroupFit {
  const c = compileGroup(pattern)
  const groups = new Set<string>()
  const envs = new Set<string>()
  let matched = 0
  if (c) {
    for (const n of names) {
      const m = c.re.exec(n)
      if (!m) continue
      matched++
      groups.add(m[1])
      if (m[2] !== undefined) envs.add(m[2])
    }
  }
  return { pattern, matched, total: names.length, groups: [...groups].sort(), envs: [...envs].sort() }
}

/**
 * The setup guide's suggestions under "Group names by": no grouping, and
 * each preset with how it would group this source's names, once they are
 * listed. The field itself takes any pattern.
 */
export function groupSuggestions(names: string[]): { value: string; label: string; hint?: string }[] {
  const fit = (p: string) => {
    if (!names.length) return undefined
    const f = groupFit(p, names)
    return f.groups.length ? `${f.groups.length} group${f.groups.length === 1 ? '' : 's'} · ${f.matched} of ${f.total} names` : 'no names fit'
  }
  return [{ value: '', label: 'No grouping', hint: 'one flat list' }, ...GROUP_PRESETS.map((p) => ({ value: p, label: p, hint: fit(p) }))]
}

/**
 * The first preset (most specific first) that fits these names: it groups
 * at least half of them into more than one group, and some value of its
 * second placeholder turns up in more than one group, the way "dev" does in
 * orders-dev-env and payments-dev-env. That last test is what tells a real
 * environment from a pattern that only splits names at a dash (a looser
 * pattern always matches more: "{service}-{env}" takes "a-dev-env" as
 * service "a-dev" and environment "env").
 */
export function suggestGroup(names: string[]): GroupFit | null {
  for (const p of GROUP_PRESETS) {
    const f = groupFit(p, names)
    if (f.groups.length >= 2 && f.matched * 2 >= names.length && sharesEnv(p, names)) return f
  }
  return null
}

/** True when a value of the pattern's second placeholder appears under two or more groups. */
function sharesEnv(pattern: string, names: string[]): boolean {
  const c = compileGroup(pattern)
  if (!c || c.names.length < 2) return false
  const groupsOf = new Map<string, Set<string>>()
  for (const n of names) {
    const m = c.re.exec(n)
    if (!m) continue
    const set = groupsOf.get(m[2]) ?? new Set<string>()
    set.add(m[1])
    groupsOf.set(m[2], set)
    if (set.size > 1) return true
  }
  return false
}

const PROD_WORDS = ['prod', 'production', 'prd', 'live']

/**
 * Protect patterns that would cover production secrets: for each group
 * pattern, the pattern with the group as * and the environment as a
 * production word seen in the names (or "prod" when none was seen yet),
 * plus the plain "*-prod-*" style catch-alls.
 */
export function suggestProtect(groups: string[], envsSeen: string[]): string[] {
  const out: string[] = []
  const add = (p: string) => {
    if (!out.includes(p)) out.push(p)
  }
  const prodEnvs = envsSeen.filter((e) => PROD_WORDS.includes(e.toLowerCase()))
  for (const g of groups) {
    const c = compileGroup(g)
    if (!c || c.names.length < 2) continue
    for (const env of prodEnvs.length ? prodEnvs : ['prod']) {
      let i = 0
      add(g.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, () => (i++ === 1 ? env : '*')))
    }
  }
  add('*-prod-*')
  add('*-prod')
  add('*production*')
  return out
}

/** How many of these names a protect pattern covers; null when the pattern is not valid. */
export function protectCount(pattern: string, names: string[]): number | null {
  try {
    const re = globToRegExp(pattern)
    return names.filter((n) => re.test(n)).length
  } catch {
    return null
  }
}

/** A protect pattern the core would refuse (path.Match syntax), or ''. */
export function protectError(pattern: string): string {
  const p = pattern.trim()
  if (!p) return 'enter a pattern'
  if (/\[[^\]]*$/.test(p)) return 'an unclosed [ in the pattern'
  try {
    globToRegExp(p)
  } catch {
    return 'not a valid pattern'
  }
  return ''
}
