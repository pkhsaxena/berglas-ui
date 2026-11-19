// Where a dropped file can go: the drop dialog's search over the open
// source's secrets, plus "a new secret". Holds no markup; the skins' FileDrop
// renders it. Choosing only opens the editor or the create form, on its
// review screen: nothing is written from here.
import { fuzzyScore } from './palette'

export type DropChoice = { kind: 'replace'; name: string; open: boolean } | { kind: 'create'; name: string }

export type DropChoices = {
  choices: DropChoice[]
  /** why the query can't name a new secret, when it can't ('' otherwise) */
  problem: string
}

/**
 * The secrets a dropped file could replace, best first, then a new secret.
 *
 * - An empty query lists the open secret first, then the secrets whose names
 *   look like the file's (`suggested`, from its file name), then the rest A–Z.
 *   The new secret is named `suggested` when that name is free.
 * - A query lists the secrets it matches (as in ⌘K), then a new secret with
 *   the query as its name when no secret has that exact name and the name is
 *   usable here (`nameProblem` says why not).
 * - A read-only source offers nothing.
 */
export function dropChoices(o: {
  names: string[]
  query: string
  open: string | null
  suggested: string
  writable: boolean
  nameProblem: (name: string) => string
  limit?: number
}): DropChoices {
  if (!o.writable) return { choices: [], problem: '' }
  const limit = o.limit ?? 200
  const q = o.query.trim()
  const names = [...new Set(o.names)]
  const replace = (name: string): DropChoice => ({ kind: 'replace', name, open: name === o.open })

  let found: string[]
  if (!q) {
    const like = o.suggested
      ? names
          .filter((n) => n !== o.open)
          .map((n) => ({ n, s: fuzzyScore(o.suggested, n) }))
          .filter((x): x is { n: string; s: number } => x.s !== null)
          .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
          .map((x) => x.n)
      : []
    const rest = names.filter((n) => n !== o.open && !like.includes(n)).sort((a, b) => a.localeCompare(b))
    found = [...(o.open && names.includes(o.open) ? [o.open] : []), ...like, ...rest]
  } else {
    found = names
      .map((n) => ({ n, s: fuzzyScore(q, n) }))
      .filter((x): x is { n: string; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s || Number(b.n === o.open) - Number(a.n === o.open) || a.n.localeCompare(b.n))
      .map((x) => x.n)
  }
  const choices = found.slice(0, limit).map(replace)

  const newName = q || (o.suggested && !names.includes(o.suggested) ? o.suggested : '')
  if (q && names.includes(q)) return { choices, problem: '' }
  const problem = newName ? o.nameProblem(newName) : ''
  if (!problem) choices.push({ kind: 'create', name: newName })
  return { choices, problem: q ? problem : '' }
}

/**
 * The dialog's order: the new secret first (a skin pins it under the search
 * box, so it never scrolls away), then the secrets. `start` is the selection
 * a new drop or query begins with: the first secret (the open one, with no
 * query), so Enter still reviews it; the new secret when no secret matches.
 */
export type DropList = { choices: DropChoice[]; create: DropChoice | null; start: number; problem: string }

export function dropList(r: DropChoices): DropList {
  const create = r.choices.find((c) => c.kind === 'create') ?? null
  const choices = [...(create ? [create] : []), ...r.choices.filter((c) => c.kind !== 'create')]
  return { choices, create, start: create && choices.length > 1 ? 1 : 0, problem: r.problem }
}

export type DropAction = { kind: 'move'; index: number } | { kind: 'choose'; choice: DropChoice } | { kind: 'cancel' } | { kind: 'none' }

/**
 * What a key in the search box does, or null for keys it leaves alone
 * (typing). ↑↓ move and wrap, so ↑ from the first secret reaches the new
 * secret; Enter chooses the selection; ⌘Enter or Ctrl+Enter chooses the new
 * secret wherever the selection is; Esc cancels. 'none' is a handled key
 * with nothing to do (↑↓ on an empty list, ⌘Enter with no new secret).
 */
export function dropKey(list: DropList, index: number, k: { key: string; meta?: boolean; ctrl?: boolean }): DropAction | null {
  const n = list.choices.length
  if (k.key === 'Enter' && (k.meta || k.ctrl)) return list.create ? { kind: 'choose', choice: list.create } : { kind: 'none' }
  if (k.key === 'ArrowDown' || k.key === 'ArrowUp') {
    if (!n) return { kind: 'none' }
    const i = Math.min(Math.max(index, 0), n - 1)
    return { kind: 'move', index: (i + (k.key === 'ArrowDown' ? 1 : -1) + n) % n }
  }
  if (k.key === 'Enter') return list.choices[index] ? { kind: 'choose', choice: list.choices[index] } : { kind: 'none' }
  if (k.key === 'Escape') return { kind: 'cancel' }
  return null
}
