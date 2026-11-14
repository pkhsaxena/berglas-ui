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

// The two highlights are made once and registered once, then emptied and
// refilled in place. WebKit (the mac app, Safari) does not repaint the old
// matches when a registered highlight is replaced or deleted, so they stayed
// painted after the query changed; emptying the same highlight does repaint.
// As a backstop, every element that held a match is nudged to repaint too.
type HighlightLike = { add(r: Range): void; clear(): void; size: number; [Symbol.iterator](): IterableIterator<Range> }
type Registry = { set(name: string, h: HighlightLike): void; get(name: string): HighlightLike | undefined; delete(name: string): void }

const registry = (): Registry | undefined => (globalThis as { CSS?: { highlights?: Registry } }).CSS?.highlights
const HighlightCtor = (): (new () => HighlightLike) | undefined => (globalThis as { Highlight?: new () => HighlightLike }).Highlight

let all: HighlightLike | undefined
let current: HighlightLike | undefined

/** The registered highlights, made and registered on first use. */
function highlights(): { all: HighlightLike; current: HighlightLike } | undefined {
  const reg = registry()
  const H = HighlightCtor()
  if (!reg || !H) return undefined
  if (!all || reg.get('find') !== all) reg.set('find', (all = new H()))
  if (!current || reg.get('find-current') !== current) reg.set('find-current', (current = new H()))
  return { all, current }
}

/** Makes WebKit repaint these elements: an invisible outline for one frame. */
function nudge(ranges: Iterable<Range>) {
  const els = new Set<HTMLElement>()
  for (const r of ranges) {
    const el = r.startContainer.parentElement
    if (el) els.add(el)
  }
  if (els.size === 0) return
  for (const el of els) el.style.outline = '1px solid transparent'
  requestAnimationFrame(() => {
    for (const el of els) el.style.outline = ''
  })
}

/**
 * Paints all matches and the current one (css ::highlight(find) and
 * ::highlight(find-current)), replacing whatever was painted before. Where
 * the highlight api is missing, the current match is selected instead.
 */
export function paint(ranges: Range[], at: number) {
  const h = highlights()
  if (h) {
    const old = [...h.all]
    h.all.clear()
    h.current.clear()
    for (const r of ranges) h.all.add(r)
    if (ranges[at]) h.current.add(ranges[at])
    nudge(old)
    return
  }
  const sel = window.getSelection()
  sel?.removeAllRanges()
  if (ranges[at]) sel?.addRange(ranges[at])
}

export function clearPaint() {
  const h = highlights()
  if (h) {
    const old = [...h.all]
    h.all.clear()
    h.current.clear()
    nudge(old)
    return
  }
  window.getSelection()?.removeAllRanges()
}

/** Scrolls the current match into view inside whichever pane holds it. */
export function reveal(range: Range | undefined) {
  range?.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
