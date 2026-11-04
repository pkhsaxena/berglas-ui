// Parses a secret as a .env file when it looks like one, for the per-key view.
// The raw view stays authoritative: this parser is for display only and keeps
// each line's original text so edits can later rewrite one line in place.

export type EnvLine =
  | { kind: 'pair'; key: string; value: string; raw: string }
  | { kind: 'other'; raw: string }

const PAIR = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s?(.*)$/

export function parseEnv(text: string): EnvLine[] {
  return text.split(/\r?\n/).map((raw) => {
    const m = PAIR.exec(raw)
    return m ? { kind: 'pair', key: m[1], value: m[2], raw } : { kind: 'other', raw }
  })
}

/** True when most non-blank, non-comment lines are KEY=value pairs. */
export function looksLikeEnv(text: string): boolean {
  const lines = parseEnv(text).filter((l) => l.raw.trim() !== '' && !l.raw.trim().startsWith('#'))
  if (lines.length === 0) return false
  const pairs = lines.filter((l) => l.kind === 'pair').length
  return pairs / lines.length >= 0.8
}
