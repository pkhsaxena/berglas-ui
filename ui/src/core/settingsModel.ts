// The settings screen as data: every setting the config file has, in
// sections, with what a skin needs to draw and search it. Skins draw the
// rows; nothing here holds markup.
//
// Two kinds of setting: most are saved the moment they change. Safety
// settings (read-only, protection, the timers that hide and lock, screen
// capture, the audit log) are collected in a draft and saved together, after
// one confirmation; until then the saved values stay in force.
import type { ConfigPatch, EnvOrder } from './api'
import { type Source, sourceId, sourceName } from './sources'
import type { TimeZone } from './time'

export type SectionId = 'appearance' | 'safety' | 'sources' | 'identity' | 'background' | 'browser' | 'about'

export const SECTIONS: { id: SectionId; title: string; blurb?: string }[] = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'safety', title: 'Safety', blurb: 'Changes here are saved together, after you confirm them once. Until then the saved values stay in force.' },
  { id: 'sources', title: 'Sources', blurb: 'Add or remove a source in the sources pane; its details are set here.' },
  { id: 'identity', title: 'Identity' },
  { id: 'background', title: 'Cache and watch' },
  // the mac app ignores these, and its settings screen leaves the section out
  { id: 'browser', title: 'Browser version', blurb: 'For berglas-ui run from a terminal and used in a browser.' },
  { id: 'about', title: 'About' },
]

/** The settings with one value each, as the screen shows them. */
export type FieldValues = {
  skin: string
  theme: string
  zoom: number
  timeZone: TimeZone
  envOrder: EnvOrder
  recentCollapsed: boolean
  readOnly: boolean
  protect: string[]
  lockAfterMinutes: number
  revealSeconds: number
  clipboardClearSeconds: number
  allowScreenCapture: boolean
  auditLog: string
  cacheSeconds: number
  cacheEntries: number
  watchMinutes: number
  listen: string
  openBrowser: boolean
}

export type FieldKey = keyof FieldValues

type Common = {
  section: SectionId
  label: string
  help: string
  /** extra words the search matches */
  keywords?: string
}

type FieldBase = Common & {
  key: FieldKey
  /** saved with the other safety settings, after one confirmation */
  safety?: boolean
  /** read when the app starts: a change waits for a restart */
  restart?: boolean
}

export type Field =
  | (FieldBase & { kind: 'toggle' })
  | (FieldBase & { kind: 'choice' })
  | (FieldBase & { kind: 'number'; unit: string; min: number; max?: number; /** what 0 means, e.g. "never" */ zero?: string })
  | (FieldBase & { kind: 'text'; placeholder?: string; /** what an empty value means */ empty?: string })
  | (FieldBase & { kind: 'list'; placeholder?: string })

/** A part of the screen a skin draws by hand: per-source settings, the identity, the file. */
export type Block = Common & { kind: 'block'; key: 'sourceSafety' | 'sources' | 'identity' | 'about' }

export type Item = Field | Block

export const ITEMS: Item[] = [
  { key: 'skin', kind: 'choice', section: 'appearance', label: 'Skin', help: 'The design of the whole app. Changing it reloads the window.', keywords: 'design look terminal native' },
  { key: 'theme', kind: 'choice', section: 'appearance', label: 'Theme', help: 'Colours. Each skin has its own themes.', keywords: 'colors colours dark light' },
  { key: 'zoom', kind: 'choice', section: 'appearance', label: 'Zoom', help: 'Scales the whole app. Zoomed out far enough, panes sit side by side.', keywords: 'size scale percent' },
  { key: 'timeZone', kind: 'choice', section: 'appearance', label: 'Time zone', help: 'Show times in this computer’s zone or in UTC.', keywords: 'clock utc local dates' },
  { key: 'envOrder', kind: 'choice', section: 'appearance', label: '.env order', help: 'Show .env secrets sorted by section and key, or as the file has them. The stored file is never reordered.', keywords: 'sort keys file order' },
  { key: 'recentCollapsed', kind: 'toggle', section: 'appearance', label: 'Fold the recent list', help: 'Show only the Recent heading above the secret list.', keywords: 'collapse recents' },

  { key: 'readOnly', kind: 'toggle', section: 'safety', safety: true, label: 'Read-only', help: 'Refuse every write, in every source. The core enforces it.', keywords: 'readonly writes lock edit' },
  {
    key: 'protect',
    kind: 'list',
    section: 'safety',
    safety: true,
    label: 'Protected names',
    help: 'Name patterns, separated by commas. Saving a matching secret, also to a file, asks you to type “confirm”; deleting it asks for its name. * matches any run of characters.',
    placeholder: '*-prod-*',
    keywords: 'protect patterns glob prod confirm',
  },
  { key: 'lockAfterMinutes', kind: 'number', section: 'safety', safety: true, label: 'Lock after', unit: 'minutes', min: 0, zero: 'never', help: 'Lock the app after this long without input. In the mac app, unlocking asks for Touch ID or your login password.', keywords: 'idle touch id autolock timeout' },
  { key: 'revealSeconds', kind: 'number', section: 'safety', safety: true, label: 'Hide revealed values after', unit: 'seconds', min: 0, zero: 'never', help: 'A revealed value is masked again after this long. A value already on screen keeps the time it was revealed with.', keywords: 'reveal mask timeout hide' },
  { key: 'clipboardClearSeconds', kind: 'number', section: 'safety', safety: true, label: 'Clear the clipboard after', unit: 'seconds', min: 0, zero: 'never', help: 'A copied value is cleared from the clipboard after this long, if it is still there.', keywords: 'copy paste clipboard clear' },
  { key: 'allowScreenCapture', kind: 'toggle', section: 'safety', safety: true, restart: true, label: 'Allow screen capture', help: 'Let screenshots, screen recording and screen sharing see the mac app’s window. Off, the window shows up blank in them.', keywords: 'screenshot recording sharing content protection' },
  { key: 'auditLog', kind: 'text', section: 'safety', safety: true, label: 'Audit log file', help: 'One line per write and per safety settings change; never a value.', placeholder: '~/.berglas-ui/audit.log', empty: 'off', keywords: 'audit log history record file path' },
  { key: 'sourceSafety', kind: 'block', section: 'safety', label: 'Per source', help: 'Read-only and extra protected names for one source.', keywords: 'source read-only readonly protect bucket project' },

  { key: 'sources', kind: 'block', section: 'sources', label: 'Sources', help: 'Label, default KMS key, grouping pattern and which one opens at start.', keywords: 'bucket project label kms key group default storage secret manager' },

  { key: 'identity', kind: 'block', section: 'identity', label: 'Act as', help: 'The Google identity the core uses for every call. Your gcloud login stays the same.', keywords: 'credentials impersonate service account quota project gcloud adc choices' },

  { key: 'cacheSeconds', kind: 'number', section: 'background', label: 'Keep lists for', unit: 'seconds', min: 0, zero: 'no cache', help: 'How long secret and version lists (names, never values) are kept to show at once on a revisit.', keywords: 'cache ttl revisit' },
  { key: 'cacheEntries', kind: 'number', section: 'background', label: 'Cached lists', unit: 'lists', min: 0, zero: 'no cache', help: 'At most this many lists are kept; the least recently used go first.', keywords: 'cache size entries' },
  { key: 'watchMinutes', kind: 'number', section: 'background', label: 'Check watched secrets every', unit: 'minutes', min: 1, help: 'How often the mac app looks for new versions of watched secrets. A wait already running finishes first.', keywords: 'watch notify interval poll' },

  { key: 'listen', kind: 'text', section: 'browser', restart: true, label: 'Listen address', help: 'host:port for the core. Port 0 picks a free one. -listen and BERGLAS_UI_LISTEN win over this.', placeholder: '127.0.0.1:0', empty: '127.0.0.1:0', keywords: 'port host address server' },
  { key: 'openBrowser', kind: 'toggle', section: 'browser', restart: true, label: 'Open the browser at start', help: 'Open the ui in your default browser when the core starts.', keywords: 'launch open browser' },

  { key: 'about', kind: 'block', section: 'about', label: 'Config file', help: 'Where these settings are saved.', keywords: 'config file path yaml version saved location' },
]

export const isField = (i: Item): i is Field => i.kind !== 'block'

export const fieldFor = (key: FieldKey) => ITEMS.find((i): i is Field => isField(i) && i.key === key)!

const sectionTitle = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.title ?? ''

/**
 * True when every word of the query is somewhere in the item's label, help,
 * config key, keywords, section title or `extra` (a block's own content, like
 * source names). An empty query matches everything.
 */
export function matchesQuery(item: Item, query: string, extra = ''): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${item.label} ${item.help} ${item.key} ${item.keywords ?? ''} ${sectionTitle(item.section)} ${extra}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** The sections that have matching items, in order, each with those items. `hidden` sections are left out whatever the query. */
export function visibleSections(query: string, extra: Partial<Record<Item['key'], string>> = {}, hidden: readonly SectionId[] = []): { id: SectionId; title: string; blurb?: string; items: Item[] }[] {
  return SECTIONS.filter((s) => !hidden.includes(s.id)).map((s) => ({ ...s, items: ITEMS.filter((i) => i.section === s.id && matchesQuery(i, query, extra[i.key])) })).filter((s) => s.items.length > 0)
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** A whole number within the field's limits. */
export function parseNumber(f: Extract<Field, { kind: 'number' }>, text: string): Parsed<number> {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return { ok: false, error: `enter a whole number of ${f.unit}` }
  const n = Number(t)
  if (!Number.isSafeInteger(n)) return { ok: false, error: 'too large' }
  if (n < f.min) return { ok: false, error: `at least ${f.min}` }
  if (f.max !== undefined && n > f.max) return { ok: false, error: `at most ${f.max}` }
  return { ok: true, value: n }
}

/** Patterns from a comma-, space- or line-separated list; blanks and repeats dropped. */
export function parseList(text: string): string[] {
  const out: string[] = []
  for (const p of text.split(/[\s,]+/)) if (p && !out.includes(p)) out.push(p)
  return out
}

export const listText = (list: readonly string[]) => list.join(', ')

/** A value in words, for the list of pending changes. */
export function formatValue(f: Field, value: unknown): string {
  switch (f.kind) {
    case 'toggle':
      return value ? 'on' : 'off'
    case 'number':
      return value === 0 && f.zero ? f.zero : `${value} ${f.unit}`
    case 'list':
      return (value as string[]).length ? listText(value as string[]) : 'none'
    case 'text':
      return (value as string) || f.empty || 'not set'
    default:
      return String(value)
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A source's safety settings, as far as the draft changes them. */
export type SourceSafety = { readOnly?: boolean; protect?: string[] }

export type SafetyKey = 'readOnly' | 'protect' | 'lockAfterMinutes' | 'revealSeconds' | 'clipboardClearSeconds' | 'allowScreenCapture' | 'auditLog'

/** Safety settings edited but not saved yet. `sources` is keyed by sourceId. */
export type SafetyDraft = Partial<Pick<FieldValues, SafetyKey>> & { sources?: Record<string, SourceSafety> }

const SAFETY_FIELDS = ITEMS.filter((i): i is Field => isField(i) && !!i.safety)

export type Change = { id: string; label: string; from: string; to: string }

/** What saving the draft would change, in screen order. Values equal to the saved ones are not changes. */
export function draftChanges(saved: FieldValues, sources: Source[], draft: SafetyDraft): Change[] {
  const out: Change[] = []
  for (const f of SAFETY_FIELDS) {
    const key = f.key as SafetyKey
    const v = draft[key]
    if (v === undefined || same(v, saved[key])) continue
    out.push({ id: key, label: f.label, from: formatValue(f, saved[key]), to: formatValue(f, v) })
  }
  for (const s of sources) {
    const d = draft.sources?.[sourceId(s)]
    if (!d) continue
    const name = sourceName(s)
    if (d.readOnly !== undefined && d.readOnly !== !!s.readOnly) out.push({ id: `${sourceId(s)} readOnly`, label: `${name}: read-only`, from: s.readOnly ? 'on' : 'off', to: d.readOnly ? 'on' : 'off' })
    if (d.protect !== undefined && !same(d.protect, s.protect ?? []))
      out.push({ id: `${sourceId(s)} protect`, label: `${name}: protected names`, from: s.protect?.length ? listText(s.protect) : 'none', to: d.protect.length ? listText(d.protect) : 'none' })
  }
  return out
}

/** The draft as one save: only what differs from the saved values. */
export function draftPatch(saved: FieldValues, sources: Source[], draft: SafetyDraft): ConfigPatch {
  const patch: Record<string, unknown> = {}
  for (const f of SAFETY_FIELDS) {
    const key = f.key as SafetyKey
    const v = draft[key]
    if (v !== undefined && !same(v, saved[key])) patch[key] = v
  }
  const next = sources.map((s) => withSourceSafety(s, draft.sources?.[sourceId(s)]))
  if (!same(next, sources)) patch.sources = next
  return patch as ConfigPatch
}

function withSourceSafety(s: Source, d: SourceSafety | undefined): Source {
  if (!d) return s
  const out: Source = { ...s }
  if (d.readOnly !== undefined) {
    if (d.readOnly) out.readOnly = true
    else delete out.readOnly
  }
  if (d.protect !== undefined) {
    if (d.protect.length) out.protect = d.protect
    else delete out.protect
  }
  return out
}

/** A source's fields that are not safety settings; saved as they change. */
export type SourceDetail = Pick<Source, 'label' | 'kmsKey' | 'group' | 'default'>

/** The sources with one changed. Empty text clears a field; a new default takes it from the others. */
export function withSourceDetail(sources: Source[], id: string, change: SourceDetail): Source[] {
  return sources.map((s) => {
    const mine = sourceId(s) === id
    const out: Source = { ...s }
    if (change.default && !mine) delete out.default
    if (!mine) return out
    for (const [k, v] of Object.entries(change) as [keyof SourceDetail, string | boolean | undefined][]) {
      const val = typeof v === 'string' ? v.trim() : v
      if (!val) delete out[k]
      else (out as Record<string, unknown>)[k] = val
    }
    return out
  })
}

export type ChoiceKey = 'skin' | 'theme' | 'zoom' | 'timeZone' | 'envOrder'

export type ChoiceOption = { value: string; label: string }

/** The options of the choice settings. Themes and skins are the skin's and the build's; zoom offers the current percent even when it is not a step. */
export function choiceOptions(o: { skins: readonly { name: string; label: string }[]; themes: readonly string[]; zoomSteps: readonly number[]; zoom: number; localZone: string }): Record<ChoiceKey, ChoiceOption[]> {
  const steps = o.zoomSteps.includes(o.zoom) ? [...o.zoomSteps] : [...o.zoomSteps, o.zoom].sort((a, b) => a - b)
  return {
    skin: o.skins.map((s) => ({ value: s.name, label: s.label })),
    theme: o.themes.map((t) => ({ value: t, label: t })),
    zoom: steps.map((z) => ({ value: String(z), label: `${z}%` })),
    timeZone: [
      { value: 'local', label: `Local (${o.localZone})` },
      { value: 'utc', label: 'UTC' },
    ],
    envOrder: [
      { value: 'sorted', label: 'Sorted by section and key' },
      { value: 'file', label: 'As in the file' },
    ],
  }
}
