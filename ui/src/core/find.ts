// Find in page, for the desktop app (its web view has no find bar; in a
// browser, ⌘F stays the browser's own). Pure helpers; hooks/useFind.ts holds
// the state.
//
// Matches are DOM Ranges over visible text, case-insensitive. Text that sits
// together on one line is searched as one string even when it is split into
// several text nodes: a .env key is drawn as "APP_" <wbr> "ENV" (KeyText), and
// "APP_ENV" must still match it. Text in different blocks (table cells, list
// rows, paragraphs) is never joined. Masked values are not text in the page,
// so they are never found.

/** Text offsets where `query` occurs in `text`, any case. */
export function findOffsets(text: string, query: string): number[] {
  const q = query.toLowerCase()
  if (!q) return []
  const t = text.toLowerCase()
  const out: number[] = []
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push(i)
  return out
}

/** A match as [piece, offset] at each end, over pieces of text read as one string. */
export type Span = { start: [number, number]; end: [number, number] }

/** Matches of query across pieces of text joined with nothing between them. */
export function spanMatches(pieces: string[], query: string): Span[] {
  const joined = pieces.join('')
  const starts: number[] = []
  let at = 0
  for (const p of pieces) {
    starts.push(at)
    at += p.length
  }
  // the piece holding character i (for an end, the piece holding i - 1)
  const locate = (i: number, isEnd: boolean): [number, number] => {
    let k = pieces.length - 1
    while (k > 0 && (isEnd ? starts[k] >= i : starts[k] > i)) k--
    return [k, i - starts[k]]
  }
  return findOffsets(joined, query).map((o) => ({ start: locate(o, false), end: locate(o + query.length, true) }))
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'])

function visible(el: Element): boolean {
  if (el.closest('[data-find-ignore]')) return false
  if (el.getClientRects().length === 0) return false // display: none, or inside it
  const s = getComputedStyle(el)
  return s.visibility !== 'hidden'
}

/** The nearest ancestor that is not display: inline; text under one is read together. */
function blockOf(el: Element, cache: Map<Element, Element>): Element {
  const hit = cache.get(el)
  if (hit) return hit
  let b: Element = el
  while (b.parentElement && getComputedStyle(b).display === 'inline') b = b.parentElement
  cache.set(el, b)
  return b
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
  const blocks = new Map<Element, Element>()
  let run: Text[] = []
  let runBlock: Element | null = null
  const flush = () => {
    if (run.length) {
      for (const m of spanMatches(run.map((t) => t.nodeValue!), query)) {
        const r = document.createRange()
        r.setStart(run[m.start[0]], m.start[1])
        r.setEnd(run[m.end[0]], m.end[1])
        ranges.push(r)
      }
    }
    run = []
    runBlock = null
  }
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement!
    let ok = seen.get(p)
    if (ok === undefined) seen.set(p, (ok = visible(p)))
    if (!ok) {
      flush() // never join text across something hidden
      continue
    }
    const b = blockOf(p, blocks)
    if (b !== runBlock) flush()
    runBlock = b
    run.push(n as Text)
  }
  flush()
  return ranges
}

// The two highlights are made once and registered once, then emptied and
// refilled in place. WebKit (the mac app, Safari) does not repaint the old
// matches when a registered highlight is replaced or deleted, so they stayed
// painted after the query changed; emptying the same highlight does repaint.
// As a backstop, every element that held a match is nudged to repaint too.
//
// WebKit also leaves the text inside a <button> unpainted. There each match
// gets its own boxes: <span data-find-mark="match|current"> laid over the
// matched letters inside the button (which gets data-find-host), for the
// skin to style. The skin turns ::highlight off inside buttons, so every
// engine looks the same.
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

let marks: HTMLElement[] = []
let hosts: HTMLElement[] = []

/** True for nodes find adds itself (the marks), so watching the page can skip them. */
export const isMark = (n: Node) => n instanceof Element && n.hasAttribute('data-find-mark')

/** Lays boxes over the matched letters inside buttons; removes the previous ones. */
function markButtons(ranges: Range[], at: number) {
  for (const m of marks) m.remove()
  for (const h of hosts) h.removeAttribute('data-find-host')
  marks = []
  hosts = []
  ranges.forEach((r, i) => {
    const b = r.startContainer.parentElement?.closest('button')
    if (!b) return
    if (!b.hasAttribute('data-find-host')) {
      b.setAttribute('data-find-host', '')
      hosts.push(b)
    }
    const br = b.getBoundingClientRect()
    // client rects are in screen px; the boxes are placed in the button's own
    // css px, which differ under the ui zoom
    const scale = b.offsetWidth ? br.width / b.offsetWidth : 1
    for (const rect of r.getClientRects()) {
      const m = document.createElement('span')
      m.setAttribute('data-find-mark', i === at ? 'current' : 'match')
      m.setAttribute('aria-hidden', 'true')
      m.style.left = `${(rect.left - br.left) / scale - b.clientLeft}px`
      m.style.top = `${(rect.top - br.top) / scale - b.clientTop}px`
      m.style.width = `${rect.width / scale}px`
      m.style.height = `${rect.height / scale}px`
      b.appendChild(m)
      marks.push(m)
    }
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
    markButtons(ranges, at)
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
    markButtons([], -1)
    nudge(old)
    return
  }
  window.getSelection()?.removeAllRanges()
}

/** Scrolls the current match into view inside whichever pane holds it. */
export function reveal(range: Range | undefined) {
  range?.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
