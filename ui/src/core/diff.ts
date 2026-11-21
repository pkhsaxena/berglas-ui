// Diffs between two secret values: line by line for any text, and key by key
// when both sides are .env files.
import { diffLines } from 'diff'
import { parseEnv, removeKey, setKey } from './envfile'
import { compareKeys } from './envsort'

export type DiffLine = { kind: 'add' | 'del' | 'same'; text: string }

/** One entry per line, in order, marked added/removed/unchanged. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const out: DiffLine[] = []
  for (const part of diffLines(a, b)) {
    const kind = part.added ? 'add' : part.removed ? 'del' : 'same'
    const lines = part.value.split('\n')
    if (lines[lines.length - 1] === '') lines.pop() // trailing newline ends the run
    for (const text of lines) out.push({ kind, text })
  }
  return out
}

export type KeyChange =
  | { kind: 'added'; key: string; after: string }
  | { kind: 'removed'; key: string; before: string }
  /** quotesOnly: the values differ only by surrounding quotes ("x" vs x), which dotenv loaders read the same */
  | { kind: 'changed'; key: string; before: string; after: string; quotesOnly: boolean }
  | { kind: 'same'; key: string; value: string }

/**
 * A value without one matching pair of surrounding quotes: "abc" and 'abc'
 * become abc. Anything else (one-sided quotes, spaces outside the quotes) is
 * returned as is, since those can be real differences.
 */
export function unquote(v: string): string {
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1)
  return v
}

/** Last value of each KEY=value line, in first-seen order. */
function envMap(text: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const l of parseEnv(text)) if (l.kind === 'pair') m.set(l.key, l.value)
  return m
}

/**
 * Key-level diff of two .env texts: keys of `b` in its order, then keys only
 * in `a`. A key repeated in one file counts with its last value, as most
 * .env loaders do.
 */
export function envDiff(a: string, b: string): KeyChange[] {
  const before = envMap(a)
  const after = envMap(b)
  const out: KeyChange[] = []
  for (const [key, v] of after) {
    const old = before.get(key)
    if (old === undefined) out.push({ kind: 'added', key, after: v })
    else if (old !== v) out.push({ kind: 'changed', key, before: old, after: v, quotesOnly: unquote(old) === unquote(v) })
    else out.push({ kind: 'same', key, value: v })
  }
  for (const [key, v] of before) if (!after.has(key)) out.push({ kind: 'removed', key, before: v })
  return out
}

/** changed counts every changed key; quotesOnly is how many of those differ only by quotes */
export type DiffSummary = { added: number; removed: number; changed: number; quotesOnly: number }

export function summarize(d: KeyChange[] | DiffLine[]): DiffSummary {
  const s = { added: 0, removed: 0, changed: 0, quotesOnly: 0 }
  for (const c of d) {
    if (c.kind === 'added' || c.kind === 'add') s.added++
    else if (c.kind === 'removed' || c.kind === 'del') s.removed++
    else if (c.kind === 'changed') {
      s.changed++
      if (c.quotesOnly) s.quotesOnly++
    }
  }
  return s
}

export type Diff = {
  /** set when both sides parse as .env files */
  keys: KeyChange[] | null
  lines: DiffLine[]
  identical: boolean
  /** .env files whose keys and values all match, though the text differs (comments, order, export, spacing) */
  sameKeys: boolean
  /** .env files that would load the same values: keys match and values differ at most by quotes */
  sameContent: boolean
}

/**
 * Replays the key changes made from `original` to `draft` onto `latest`, for
 * when someone saved `latest` while the draft was being edited. Keys that
 * both sides changed are listed in `overlaps`: the draft's value wins there,
 * so the caller should point them out before saving.
 */
export function reapplyEnv(original: string, draft: string, latest: string): { text: string; overlaps: string[] } {
  const base = envMap(original)
  const theirs = envMap(latest)
  let text = latest
  const overlaps: string[] = []
  for (const c of envDiff(original, draft)) {
    if (c.kind === 'same') continue
    if (base.get(c.key) !== theirs.get(c.key)) overlaps.push(c.key)
    text = c.kind === 'removed' ? removeKey(text, c.key) : setKey(text, c.key, c.after)
  }
  return { text, overlaps }
}

/** Diffs two texts, adding the key view when both look like .env files. */
export function diffValues(a: string, b: string, bothEnv: boolean): Diff {
  const keys = bothEnv ? envDiff(a, b) : null
  return {
    keys,
    lines: lineDiff(a, b),
    identical: a === b,
    sameKeys: !!keys && keys.every((k) => k.kind === 'same'),
    sameContent: !!keys && keys.every((k) => k.kind === 'same' || (k.kind === 'changed' && k.quotesOnly)),
  }
}

export type Match = {
  /** per key of the draft: same / changed (after = reference value) / removed (not in reference) */
  byKey: Map<string, KeyChange>
  /** keys only the reference has, with its values, sorted by key */
  missing: { key: string; value: string }[]
  /** keys whose values differ, counting those that differ only by quotes */
  differ: number
  /** how many of `differ` differ only by quotes */
  quotesOnly: number
  extra: number
  /** exactly the same keys and values */
  matches: boolean
  /** the same once quotes are ignored (and not already an exact match) */
  matchesUnquoted: boolean
}

/**
 * How a .env draft lines up with a reference .env (e.g. a pinned secret), key
 * by key, so an editor can mark each key and copy values across.
 */
export function matchAgainst(draft: string, reference: string): Match {
  const byKey = new Map<string, KeyChange>()
  const missing: { key: string; value: string }[] = []
  let differ = 0
  let quotesOnly = 0
  let extra = 0
  for (const c of envDiff(draft, reference)) {
    if (c.kind === 'added') missing.push({ key: c.key, value: c.after })
    else {
      byKey.set(c.key, c)
      if (c.kind === 'changed') {
        differ++
        if (c.quotesOnly) quotesOnly++
      }
      if (c.kind === 'removed') extra++
    }
  }
  missing.sort((a, b) => compareKeys(a.key, b.key))
  const sameKeys = extra === 0 && missing.length === 0
  return {
    byKey,
    missing,
    differ,
    quotesOnly,
    extra,
    matches: sameKeys && differ === 0,
    matchesUnquoted: sameKeys && differ > 0 && differ === quotesOnly,
  }
}
