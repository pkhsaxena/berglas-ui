// Parses and edits secrets that are .env files. Edits rewrite single lines in
// place, so comments, blank lines, `export` prefixes, spacing and CRLF line
// endings elsewhere in the file are left exactly as they were.
//
// A value can span lines when it is quoted, as dotenv loaders read it: a
// value that opens a " or ' and doesn't close it on its line goes on to the
// line holding the closing quote (a PEM key, say). The search gives up at a
// line that starts another KEY=, or at the end of the file, and the opening
// line is then a line of its own. "Line" below means one such logical line;
// `line` on each is where it starts in the file.

export type EnvLine =
  | { kind: 'pair'; key: string; value: string; prefix: string; raw: string; line: number }
  | { kind: 'other'; raw: string; line: number }

// prefix = everything before the value: indentation, `export `, key, `=`; the value may hold line breaks
const PAIR = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=[ \t]?)([\s\S]*)$/

const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/

// a line that starts another key, which ends the search for a closing quote; not a base64 line ending in = or ==
const NEXT_KEY = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=(?!=*\s*$)/

const stripCR = (s: string) => (s.endsWith('\r') ? s.slice(0, -1) : s)

// where the first unescaped `q` in s is, from `from`; -1 if none (\ escapes inside "…" only, as dotenv reads them)
function closeAt(s: string, from: number, q: string): number {
  for (let i = from; i < s.length; i++) {
    if (q === '"' && s[i] === '\\') i++
    else if (s[i] === q) return i
  }
  return -1
}

// the quote a value opens and doesn't close on its first line, if any
function openQuote(value: string): string | null {
  const q = value[0]
  if (q !== '"' && q !== "'") return null
  return closeAt(value, 1, q) < 0 ? q : null
}

/** The text's logical lines (a quoted value's lines joined), each with the line it starts on; line endings excluded except inside a value. */
function logicalLines(text: string): { text: string; line: number }[] {
  const phys = text.split('\n')
  const out: { text: string; line: number }[] = []
  for (let i = 0; i < phys.length; i++) {
    const m = PAIR.exec(stripCR(phys[i]))
    const q = m ? openQuote(m[3]) : null
    let end = i
    if (q) {
      for (let j = i + 1; j < phys.length; j++) {
        const l = stripCR(phys[j])
        if (NEXT_KEY.test(l)) break
        if (closeAt(l, 0, q) >= 0) {
          end = j
          break
        }
      }
    }
    out.push({ text: phys.slice(i, end + 1).join('\n'), line: i + 1 })
    i = end
  }
  return out
}

/** Lines of the text; `raw` excludes the line ending; a value spanning lines has \n between them. */
export function parseEnv(text: string): EnvLine[] {
  return logicalLines(text).map(({ text: chunk, line }) => {
    const raw = stripCR(chunk)
    const m = PAIR.exec(raw)
    return m ? { kind: 'pair', key: m[2], value: m[3].replace(/\r\n/g, '\n'), prefix: m[1], raw, line } : { kind: 'other', raw, line }
  })
}

/**
 * A value as it is written after KEY=: one with line breaks goes in double
 * quotes (single ones if it holds a "), unless it is quoted already.
 * Throws when it can't be quoted, or wouldn't read back as written (a line
 * inside it that looks like KEY=value).
 */
function written(key: string, value: string): string {
  if (!value.includes('\n')) return value
  const q = value[0]
  const quoted = (q === '"' || q === "'") && closeAt(value, 1, q) === value.trimEnd().length - 1
  const v = quoted ? value : !value.includes('"') ? `"${value}"` : !value.includes("'") ? `'${value}'` : null
  if (v === null) throw new Error(`the value of ${key} has line breaks and both kinds of quote; put quotes around it yourself`)
  const back = parseEnv(`${key}=${v}`)
  if (back.length !== 1 || back[0].kind !== 'pair' || back[0].value !== v) throw new Error(`the value of ${key} can't span lines: a line in it looks like another KEY=value`)
  return v
}

// a value written into a line that ends in \r keeps \r\n inside it too
const withEol = (value: string, cr: string) => (cr ? value.replace(/\n/g, '\r\n') : value)

/** True when most non-blank, non-comment lines are KEY=value pairs. */
export function looksLikeEnv(text: string): boolean {
  const lines = parseEnv(text).filter((l) => l.raw.trim() !== '' && !l.raw.trim().startsWith('#'))
  if (lines.length === 0) return false
  const pairs = lines.filter((l) => l.kind === 'pair').length
  return pairs / lines.length >= 0.8
}

export const isValidKey = (k: string) => KEY.test(k)

function rewrite(text: string, edit: (lines: string[]) => string[]): string {
  return edit(logicalLines(text).map((l) => l.text)).join('\n')
}

const eol = (line: string) => (line.endsWith('\r') ? '\r' : '')

/** Replaces the value on line i, keeping that line's prefix and ending. */
export function setLineValue(text: string, i: number, value: string): string {
  return rewrite(text, (lines) => {
    const l = parseEnv(lines[i] ?? '')[0]
    if (l.kind !== 'pair') throw new Error(`line ${i + 1} is not KEY=value`)
    lines[i] = l.prefix + withEol(written(l.key, value), eol(lines[i])) + eol(lines[i])
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
    lines[i] = m[1] + key + m[3] + withEol(l.value, eol(lines[i])) + eol(lines[i])
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
  const v = written(key, value)
  const lines = parseEnv(text)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (l.kind === 'pair' && l.key === key) return setLineValue(text, i, value)
  }
  // match the file's last line ending (files can mix them)
  const lastNl = text.lastIndexOf('\n')
  const crlf = lastNl > 0 && text[lastNl - 1] === '\r' ? '\r\n' : '\n'
  if (text === '') return `${key}=${withEol(v, crlf.slice(0, -1))}${crlf}`
  const body = text.endsWith('\n') ? text : text + crlf
  return `${body}${key}=${withEol(v, crlf.slice(0, -1))}${crlf}`
}

/** Removes every line that sets KEY. */
export function removeKey(text: string, key: string): string {
  const keep = parseEnv(text).map((l) => !(l.kind === 'pair' && l.key === key))
  return rewrite(text, (lines) => lines.filter((_, i) => keep[i]))
}

/** Inserts KEY=value right after line i (e.g. a section's last key), matching that line's ending. */
export function insertKeyAfter(text: string, i: number, key: string, value: string): string {
  if (!isValidKey(key)) throw new Error(`invalid key ${key}`)
  const v = written(key, value)
  return rewrite(text, (lines) => {
    if (i < 0 || i >= lines.length) throw new Error(`no line ${i + 1}`)
    lines.splice(i + 1, 0, `${key}=${withEol(v, eol(lines[i]))}${eol(lines[i])}`)
    return lines
  })
}

/**
 * The KEY=value pairs in pasted text, to set as keys in the editor; null when
 * the text should paste as plain text. Pasted into a value it takes two or
 * more lines that are all KEY=value (comments and blank lines aside), so a
 * single `a=b` or a PEM block stays a value; anywhere else one KEY=value line
 * is enough, as long as the text reads as a .env file.
 */
export function pastedPairs(text: string, intoValue: boolean): { key: string; value: string }[] | null {
  if (!looksLikeEnv(text)) return null
  const lines = parseEnv(text).filter((l) => l.raw.trim() !== '' && !l.raw.trim().startsWith('#'))
  const pairs = lines.flatMap((l) => (l.kind === 'pair' ? [{ key: l.key, value: l.value }] : []))
  if (pairs.length === 0) return null
  if (intoValue && (pairs.length < 2 || pairs.length !== lines.length)) return null
  return pairs
}
