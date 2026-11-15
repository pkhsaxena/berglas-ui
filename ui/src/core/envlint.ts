// Warnings shown before a .env value is saved: a key set more than once (most
// loaders keep the last, so the earlier line is silently ignored) and keys
// with an empty value. They never block a save; some files mean them.
import { looksLikeEnv, parseEnv } from './envfile'
import { unquote } from './diff'

export type EnvWarning =
  /** lines are 1-based */
  | { kind: 'duplicate'; key: string; lines: number[]; isNew: boolean }
  | { kind: 'empty'; key: string; line: number; isNew: boolean }

function scan(text: string) {
  const at = new Map<string, number[]>()
  const empty: { key: string; line: number }[] = []
  parseEnv(text).forEach((l, i) => {
    if (l.kind !== 'pair') return
    at.set(l.key, [...(at.get(l.key) ?? []), i + 1])
    if (unquote(l.value.trim()) === '') empty.push({ key: l.key, line: i + 1 })
  })
  return { dup: [...at].filter(([, lines]) => lines.length > 1), empty }
}

/**
 * Warnings for `text`; none unless it is a .env file. `before` (the value
 * being replaced) marks which ones this change introduces (isNew), so a
 * reviewer can tell new problems from ones the file already had.
 */
export function lintEnv(text: string, before = ''): EnvWarning[] {
  if (!looksLikeEnv(text)) return []
  const now = scan(text)
  const old = looksLikeEnv(before) ? scan(before) : { dup: [], empty: [] }
  const oldDup = new Set(old.dup.map(([k]) => k))
  const oldEmpty = new Set(old.empty.map((e) => e.key))
  return [
    ...now.dup.map(([key, lines]): EnvWarning => ({ kind: 'duplicate', key, lines, isNew: !oldDup.has(key) })),
    ...now.empty.map((e): EnvWarning => ({ kind: 'empty', key: e.key, line: e.line, isNew: !oldEmpty.has(e.key) })),
  ]
}

/** One line of text for a warning, for any skin. */
export function warningText(w: EnvWarning): string {
  return w.kind === 'duplicate'
    ? `${w.key} is set ${w.lines.length} times (lines ${w.lines.join(', ')}); most loaders use the last one`
    : `${w.key} is empty (line ${w.line})`
}
