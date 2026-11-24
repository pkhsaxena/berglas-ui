// Parses and edits secrets that are .env files. Edits rewrite single lines in
// place, so comments, blank lines, `export` prefixes, spacing and CRLF line
// endings elsewhere in the file are left exactly as they were.

export type EnvLine =
  | { kind: 'pair'; key: string; value: string; prefix: string; raw: string }
  | { kind: 'other'; raw: string }

// prefix = everything before the value: indentation, `export `, key, `=`
const PAIR = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s?)(.*)$/

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/** Lines of the text; `raw` excludes the line ending. */
export function parseEnv(text: string): EnvLine[] {
  return text.split('\n').map((line) => {
    const raw = line.endsWith('\r') ? line.slice(0, -1) : line
    const m = PAIR.exec(raw)
    return m ? { kind: 'pair', key: m[2], value: m[3], prefix: m[1], raw } : { kind: 'other', raw }
  })
}

/** True when most non-blank, non-comment lines are KEY=value pairs. */
export function looksLikeEnv(text: string): boolean {
  const lines = parseEnv(text).filter((l) => l.raw.trim() !== '' && !l.raw.trim().startsWith('#'))
  if (lines.length === 0) return false
  const pairs = lines.filter((l) => l.kind === 'pair').length
  return pairs / lines.length >= 0.8
}

export const isValidKey = (k: string) => KEY.test(k)

function rewrite(text: string, edit: (lines: string[]) => string[]): string {
  return edit(text.split('\n')).join('\n')
}

const eol = (line: string) => (line.endsWith('\r') ? '\r' : '')

/** Replaces the value on line i, keeping that line's prefix and ending. */
export function setLineValue(text: string, i: number, value: string): string {
  if (value.includes('\n')) throw new Error('a value cannot span lines')
  return rewrite(text, (lines) => {
    const l = parseEnv(lines[i])[0]
    if (l.kind !== 'pair') throw new Error(`line ${i + 1} is not KEY=value`)
    lines[i] = l.prefix + value + eol(lines[i])
    return lines
  })
}

// a pair line's prefix in three parts: before the key (indentation, `export `), the key, after it (spaces, `=`, a space)
const PREFIX = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s?)$/

/** Renames the key on line i, keeping its indentation, `export`, spacing, value and line ending. */
export function renameLine(text: string, i: number, key: string): string {
  if (!isValidKey(key)) throw new Error(`invalid key ${key}`)
  return rewrite(text, (lines) => {
    const l = parseEnv(lines[i] ?? '')[0]
    if (l.kind !== 'pair') throw new Error(`line ${i + 1} is not KEY=value`)
    const m = PREFIX.exec(l.prefix)
    if (!m) throw new Error(`line ${i + 1} is not KEY=value`)
    lines[i] = m[1] + key + m[3] + l.value + eol(lines[i])
    return lines
  })
}

/** Removes line i. */
export function removeLine(text: string, i: number): string {
  return rewrite(text, (lines) => {
    lines.splice(i, 1)
    return lines
  })
}

/** Sets KEY to value: rewrites its last line if present, else appends KEY=value. */
export function setKey(text: string, key: string, value: string): string {
  if (!isValidKey(key)) throw new Error(`invalid key ${key}`)
  if (value.includes('\n')) throw new Error('a value cannot span lines')
  const lines = parseEnv(text)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (l.kind === 'pair' && l.key === key) return setLineValue(text, i, value)
  }
  // match the file's last line ending (files can mix them)
  const lastNl = text.lastIndexOf('\n')
  const crlf = lastNl > 0 && text[lastNl - 1] === '\r' ? '\r\n' : '\n'
  if (text === '') return `${key}=${value}${crlf}`
  const body = text.endsWith('\n') ? text : text + crlf
  return `${body}${key}=${value}${crlf}`
}

/** Removes every line that sets KEY. */
export function removeKey(text: string, key: string): string {
  const keep = parseEnv(text).map((l) => !(l.kind === 'pair' && l.key === key))
  return rewrite(text, (lines) => lines.filter((_, i) => keep[i]))
}

/** Inserts KEY=value right after line i (e.g. a section's last key), matching that line's ending. */
export function insertKeyAfter(text: string, i: number, key: string, value: string): string {
  if (!isValidKey(key)) throw new Error(`invalid key ${key}`)
  if (value.includes('\n')) throw new Error('a value cannot span lines')
  return rewrite(text, (lines) => {
    if (i < 0 || i >= lines.length) throw new Error(`no line ${i + 1}`)
    lines.splice(i + 1, 0, `${key}=${value}${eol(lines[i])}`)
    return lines
  })
}
