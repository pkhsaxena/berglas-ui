// Whole-file copies of a .env secret: some keys as .env lines, or every key
// as shell export lines. The copy itself goes through clipboard.ts, so it is
// cleared after the clipboardClearSeconds setting like every other copy.

import { unquote } from './diff'

type Pair = { key: string; value: string }

/** The pairs as KEY=value lines, values exactly as written in the file (quotes kept). */
export function envLines(pairs: Pair[]): string {
  return pairs.map((p) => `${p.key}=${p.value}\n`).join('')
}

const SHELL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The pairs as `export KEY='value'` lines to paste into a shell: the value
 * loses one pair of surrounding quotes (as everywhere in the app) and is
 * single-quoted, so nothing in it is expanded. Keys a shell cannot name
 * (with a dot or a dash) are left out and returned in `skipped`.
 */
export function exportLines(pairs: Pair[]): { text: string; skipped: string[] } {
  const skipped: string[] = []
  let text = ''
  for (const p of pairs) {
    if (!SHELL_NAME.test(p.key)) {
      if (!skipped.includes(p.key)) skipped.push(p.key)
      continue
    }
    text += `export ${p.key}='${unquote(p.value).replace(/'/g, `'\\''`)}'\n`
  }
  return { text, skipped }
}
