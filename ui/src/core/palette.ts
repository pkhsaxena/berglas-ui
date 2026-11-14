// The command palette (⌘K): one box to jump to a secret, switch source or run
// an action. Holds no markup; a skin renders usePalette's state.
import { listKey, metaCache } from './cache'
import type { Secret } from './api'
import { type Source, sourceId, sourceName } from './sources'

export type PaletteGroup = 'Secrets' | 'Sources' | 'Actions'

export type PaletteItem = {
  id: string
  group: PaletteGroup
  label: string
  /** shown dimmed after the label, and matched with less weight */
  hint?: string
  run: () => void
}

const BOUNDARY = /[\s\-_./:@]/

/**
 * How well query matches text, or null if it doesn't: every query character
 * must appear in order (case-insensitive). Runs of adjacent characters, a
 * match at the start or after a separator, and shorter texts score higher.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  const exact = t.indexOf(q)
  if (exact >= 0) return 1000 - exact * 2 - t.length * 0.1 + (exact === 0 || BOUNDARY.test(t[exact - 1]) ? 200 : 0)
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    if (ch === ' ') continue
    const at = t.indexOf(ch, ti)
    if (at < 0) return null
    score += at === prev + 1 ? 12 : 1
    if (at === 0 || BOUNDARY.test(t[at - 1])) score += 8
    prev = at
    ti = at + 1
  }
  return score - t.length * 0.1
}

const GROUP_ORDER: Record<PaletteGroup, number> = { Secrets: 0, Sources: 1, Actions: 2 }

/**
 * Items matching the query, best first (ties keep group then input order).
 * The label counts fully; the hint counts at half weight. An empty query
 * lists everything in input order.
 */
export function rankItems(items: PaletteItem[], query: string, limit = 60): PaletteItem[] {
  if (!query.trim()) return items.slice(0, limit)
  return items
    .map((item, i) => {
      const a = fuzzyScore(query, item.label)
      const b = item.hint ? fuzzyScore(query, item.hint) : null
      const s = a === null ? (b === null ? null : b / 2) : b === null ? a : Math.max(a, b / 2)
      return { item, i, s }
    })
    .filter((x): x is { item: PaletteItem; i: number; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s || GROUP_ORDER[x.item.group] - GROUP_ORDER[y.item.group] || x.i - y.i)
    .slice(0, limit)
    .map((x) => x.item)
}

/** What a skin can do; each skin passes its own state setters. */
export type PaletteContext = {
  sources: Source[]
  active: Source | null
  /** the open source's list, when loaded */
  secrets: Secret[] | null
  openSecret: (source: Source, name: string) => void
  setActive: (source: Source) => void
  actions: { label: string; hint?: string; run: () => void }[]
}

/**
 * The palette's items: the open source's secrets, then secrets of other
 * sources whose lists are still cached (seen this session), the sources
 * themselves, and the skin's actions.
 */
export function paletteItems(c: PaletteContext): PaletteItem[] {
  const out: PaletteItem[] = []
  const add = (src: Source, list: Secret[]) => {
    for (const s of list) out.push({ id: `secret ${sourceId(src)} ${s.name}`, group: 'Secrets', label: s.name, hint: sourceName(src), run: () => c.openSecret(src, s.name) })
  }
  if (c.active && c.secrets) add(c.active, c.secrets)
  for (const src of c.sources) {
    if (c.active && sourceId(src) === sourceId(c.active)) continue
    const cached = metaCache.get(listKey(src))
    if (cached) add(src, cached)
  }
  for (const src of c.sources)
    out.push({
      id: `source ${sourceId(src)}`,
      group: 'Sources',
      label: `Open source ${sourceName(src)}`,
      hint: src.backend === 'storage' ? 'storage bucket' : 'secret manager project',
      run: () => c.setActive(src),
    })
  c.actions.forEach((a, i) => out.push({ id: `action ${i} ${a.label}`, group: 'Actions', label: a.label, hint: a.hint, run: a.run }))
  return out
}

export type PaletteView = 'overview' | 'matrix' | 'drift'

/** The actions every skin offers, from the skin's own setters. Missing setters leave their actions out. */
export function paletteActions(o: {
  newSecret?: () => void
  refresh?: () => void
  views: PaletteView[]
  showView: (v: PaletteView) => void
  driftServices: string[]
  openDrift: (service: string) => void
  find?: () => void
  zoom: (step: 1 | -1 | 0) => void
  themes: readonly string[]
  setTheme: (t: string) => void
  skins: readonly { name: string; label: string }[]
  setSkin: (name: string) => void
  setTimeZone: (z: 'local' | 'utc') => void
  /** other identities to act as */
  identities?: { key: string; label: string; serviceAccount: string; quotaProject: string }[]
  setIdentity?: (o: { serviceAccount: string; quotaProject: string }) => void
}): PaletteContext['actions'] {
  const a: PaletteContext['actions'] = []
  if (o.newSecret) a.push({ label: 'New secret', hint: 'create', run: o.newSecret })
  if (o.refresh) a.push({ label: 'Refresh the list', hint: 'reload', run: o.refresh })
  const viewName: Record<PaletteView, string> = { overview: 'Show overview', matrix: 'Show matrix', drift: 'Show drift' }
  for (const v of o.views) a.push({ label: viewName[v], hint: 'view', run: () => o.showView(v) })
  for (const s of o.driftServices) a.push({ label: `Compare keys of ${s}`, hint: 'drift across environments', run: () => o.openDrift(s) })
  if (o.find) a.push({ label: 'Find in page', hint: '⌘F', run: o.find })
  a.push({ label: 'Zoom in', hint: '⌘=', run: () => o.zoom(1) }, { label: 'Zoom out', hint: '⌘-', run: () => o.zoom(-1) }, { label: 'Actual size', hint: 'zoom ⌘0', run: () => o.zoom(0) })
  for (const t of o.themes) a.push({ label: `Theme: ${t}`, hint: 'theme', run: () => o.setTheme(t) })
  if (o.skins.length > 1) for (const s of o.skins) a.push({ label: `Skin: ${s.label}`, hint: 'skin (reloads)', run: () => o.setSkin(s.name) })
  a.push({ label: 'Time: local', hint: 'time zone', run: () => o.setTimeZone('local') }, { label: 'Time: UTC', hint: 'time zone', run: () => o.setTimeZone('utc') })
  for (const id of o.identities ?? []) a.push({ label: `Act as ${id.label}`, hint: id.serviceAccount || 'your gcloud login', run: () => o.setIdentity?.(id) })
  return a
}
