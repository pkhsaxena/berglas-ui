// Diffs between two secret values: line by line for any text, and key by key
// when both sides are .env files.
import { diffLines } from 'diff'
import { parseEnv, removeKey, setKey } from './envfile'

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
  | { kind: 'changed'; key: string; before: string; after: string }
  | { kind: 'same'; key: string; value: string }

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
    else if (old !== v) out.push({ kind: 'changed', key, before: old, after: v })
    else out.push({ kind: 'same', key, value: v })
  }
  for (const [key, v] of before) if (!after.has(key)) out.push({ kind: 'removed', key, before: v })
  return out
}

export type DiffSummary = { added: number; removed: number; changed: number }

export function summarize(d: KeyChange[] | DiffLine[]): DiffSummary {
  const s = { added: 0, removed: 0, changed: 0 }
  for (const c of d) {
    if (c.kind === 'added' || c.kind === 'add') s.added++
    else if (c.kind === 'removed' || c.kind === 'del') s.removed++
    else if (c.kind === 'changed') s.changed++
  }
  return s
}

export type Diff = {
  /** set when both sides parse as .env files */
  keys: KeyChange[] | null
  lines: DiffLine[]
  identical: boolean
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
  return { keys: bothEnv ? envDiff(a, b) : null, lines: lineDiff(a, b), identical: a === b }
}
