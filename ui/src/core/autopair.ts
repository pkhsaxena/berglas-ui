// Bracket auto-closing for small text fields (the setup guide's group
// pattern): what a key does to the text and the caret, or null to let the
// field handle it as usual.

export type PairEdit = { value: string; caret: number }

/** The brackets group patterns use. */
export const BRACES: Record<string, string> = { '{': '}' }

/**
 * - an opening bracket inserts its pair with the caret between them, or wraps
 *   the selected text (`{` on "service" gives "{service}");
 * - a closing bracket typed right before the same one steps over it;
 * - Backspace between an empty pair deletes both.
 * `start`/`end` are the selection (equal for a plain caret).
 */
export function autoPair(value: string, start: number, end: number, key: string, pairs: Record<string, string>): PairEdit | null {
  const close = pairs[key]
  if (close !== undefined) {
    const sel = value.slice(start, end)
    return { value: value.slice(0, start) + key + sel + close + value.slice(end), caret: start + 1 + sel.length }
  }
  if (start !== end) return null
  if (Object.values(pairs).includes(key) && value[start] === key) return { value, caret: start + 1 }
  if (key === 'Backspace' && start > 0 && pairs[value[start - 1]] !== undefined && pairs[value[start - 1]] === value[start]) {
    return { value: value.slice(0, start - 1) + value.slice(start + 1), caret: start - 1 }
  }
  return null
}
