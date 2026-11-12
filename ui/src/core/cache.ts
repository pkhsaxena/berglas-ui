// Keeps the last secret lists and version lists in memory, so going back to
// a source or a secret shows them at once while a fresh copy loads behind.
// Metadata only (names, versions, times) — never values. Nothing is written
// to disk or browser storage.
//
// So a long-running app does not keep growing: entries expire TTL_MS after
// they were stored, a sweep drops expired ones every SWEEP_MS even if they
// are never asked for again, and at most MAX_ENTRIES are kept (the least
// recently used go first).
import type { Ref, Secret } from './api'
import { type Source, sourceId } from './sources'

export const TTL_MS = 10 * 60_000
export const SWEEP_MS = 60_000
export const MAX_ENTRIES = 500

type Entry = { list: Secret[]; at: number }

// a Map keeps insertion order; re-inserting on use makes the first key the least recently used
const store = new Map<string, Entry>()
let sweeper: ReturnType<typeof setInterval> | undefined

const expired = (e: Entry, now: number) => now - e.at > TTL_MS

function sweep(now = Date.now()) {
  for (const [k, e] of store) if (expired(e, now)) store.delete(k)
  if (store.size === 0 && sweeper !== undefined) {
    clearInterval(sweeper)
    sweeper = undefined
  }
}

export const listKey = (s: Source) => `list ${sourceId(s)}`
export const versionsKey = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => `versions ${r.backend} ${r.parent} ${r.name}`

export const metaCache = {
  get(key: string): Secret[] | undefined {
    const e = store.get(key)
    if (!e) return undefined
    if (expired(e, Date.now())) {
      store.delete(key)
      return undefined
    }
    store.delete(key)
    store.set(key, e)
    return e.list
  },
  set(key: string, list: Secret[]) {
    store.delete(key)
    store.set(key, { list, at: Date.now() })
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!)
    sweeper ??= setInterval(sweep, SWEEP_MS)
  },
  delete: (key: string) => void store.delete(key),
  clear() {
    store.clear()
    sweep()
  },
  /** entries held, for tests */
  size: () => store.size,
}
