// Find in page, for the desktop app (its web view has no find bar; in a
// browser, ⌘F stays the browser's own). Pure helpers; hooks/useFind.ts holds
// the state.
//
// Matches are DOM Ranges over visible text, case-insensitive. A match must
// sit inside one text node, so text split across elements is not found as
// one. Masked values are not text in the page, so they are never found.

/** Text node offsets where `query` occurs in `text`, any case. */
export function findOffsets(text: string, query: string): number[] {
  const q = query.toLowerCase()
  if (!q) return []
  const t = text.toLowerCase()
  const out: number[] = []
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push(i)
  return out
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'])

function visible(el: Element): boolean {
  if (el.closest('[data-find-ignore]')) return false
  if (el.getClientRects().length === 0) return false // display: none, or inside it
  const s = getComputedStyle(el)
  return s.visibility !== 'hidden'
}

/** Ranges for every visible occurrence of query under root, in document order. */
export function findRanges(root: Node, query: string): Range[] {
  if (!query.trim()) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement
      if (!p || SKIP.has(p.tagName) || !n.nodeValue) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const seen = new Map<Element, boolean>()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement!
    let ok = seen.get(p)
    if (ok === undefined) seen.set(p, (ok = visible(p)))
    if (!ok) continue
    for (const at of findOffsets(n.nodeValue!, query)) {
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + query.length)
      ranges.push(r)
    }
  }
  return ranges
}

type Highlights = { set(name: string, h: unknown): void; delete(name: string): void }
const highlights = (): Highlights | undefined => (globalThis as { CSS?: { highlights?: Highlights } }).CSS?.highlights
const HighlightCtor = (): (new (...r: Range[]) => unknown) | undefined => (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight

/**
 * Paints all matches and the current one (css ::highlight(find) and
 * ::highlight(find-current)). Where the highlight api is missing, the
 * current match is selected instead.
 */
export function paint(ranges: Range[], current: number) {
  const hl = highlights()
  const H = HighlightCtor()
  if (hl && H) {
    hl.set('find', new H(...ranges))
    if (ranges[current]) hl.set('find-current', new H(ranges[current]))
    else hl.delete('find-current')
    return
  }
  const sel = window.getSelection()
  sel?.removeAllRanges()
  if (ranges[current]) sel?.addRange(ranges[current])
}

export function clearPaint() {
  highlights()?.delete('find')
  highlights()?.delete('find-current')
}

/** Scrolls the current match into view inside whichever pane holds it. */
export function reveal(range: Range | undefined) {
  range?.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
