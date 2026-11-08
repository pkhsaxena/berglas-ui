// A sorted view of a .env file. Only the view is sorted: every entry keeps
// the index of its line in the file, so edits still rewrite that one line and
// the stored file keeps its order.
//
// The file is read as blocks separated by blank lines:
// - a block that starts with comment lines is a section; those comments are
//   its header (e.g. "# Server" over PORT, READ_TIMEOUT, WRITE_TIMEOUT)
// - a comment between two keys in a block is a note on the key below it
// - blocks with keys but no header are merged into one "no section" group
// - blocks with no keys at all (e.g. a file banner) are file comments
// Sections sort by their first header line, keys sort inside each section,
// both case-insensitively with numbers in natural order (K2 before K10).
import { type EnvLine, parseEnv } from './envfile'

type Pair = Extract<EnvLine, { kind: 'pair' }>

export type Note = { raw: string; index: number }

export type SortedItem = { line: Pair; index: number; notes: Note[] }

export type Section = {
  /** the header's first line without "#", '' for the no-section group */
  title: string
  header: Note[]
  items: SortedItem[]
  /** comments after the section's last key */
  trailing: Note[]
  /** line index of the section's last key in the file; new keys go after it */
  lastKeyIndex: number
}

export type SortedEnv = { fileComments: Note[]; sections: Section[] }

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

const isComment = (raw: string) => raw.trimStart().startsWith('#')

/** "# Server " → "Server" */
export const commentTitle = (raw: string) => raw.trim().replace(/^#+\s*/, '').trim()

export function sortEnv(text: string): SortedEnv {
  const lines = parseEnv(text).map((line, index) => ({ line, index }))
  const blocks: (typeof lines)[] = []
  let cur: typeof lines = []
  for (const l of lines) {
    if (l.line.raw.trim() === '') {
      if (cur.length) blocks.push(cur)
      cur = []
    } else cur.push(l)
  }
  if (cur.length) blocks.push(cur)

  const fileComments: Note[] = []
  const sections: Section[] = []
  let loose: Section | null = null // all headerless blocks, merged

  for (const block of blocks) {
    if (!block.some((l) => l.line.kind === 'pair')) {
      for (const l of block) fileComments.push({ raw: l.line.raw, index: l.index })
      continue
    }
    const header: Note[] = []
    let i = 0
    while (block[i].line.kind !== 'pair') {
      header.push({ raw: block[i].line.raw, index: block[i].index })
      i++
    }
    const items: SortedItem[] = []
    let pending: Note[] = []
    for (; i < block.length; i++) {
      const { line, index } = block[i]
      if (line.kind === 'pair') {
        items.push({ line, index, notes: pending })
        pending = []
      } else pending.push({ raw: line.raw, index })
    }
    const lastKeyIndex = items[items.length - 1].index
    const headed = header.length > 0 && header.every((h) => isComment(h.raw))
    if (headed) {
      sections.push({ title: commentTitle(header[0].raw), header, items, trailing: pending, lastKeyIndex })
    } else {
      // a "header" that is not all comments is unusual text; keep it as notes
      if (header.length) items[0].notes = [...header, ...items[0].notes]
      loose ??= { title: '', header: [], items: [], trailing: [], lastKeyIndex }
      loose.items.push(...items)
      loose.trailing.push(...pending)
      loose.lastKeyIndex = lastKeyIndex
    }
  }

  const byKey = (a: SortedItem, b: SortedItem) => collator.compare(a.line.key, b.line.key) || a.index - b.index
  for (const s of sections) s.items.sort(byKey)
  sections.sort((a, b) => collator.compare(a.title, b.title) || a.header[0].index - b.header[0].index)
  if (loose) {
    loose.items.sort(byKey)
    sections.unshift(loose)
  }
  return { fileComments, sections }
}
