// Keeps the last secret lists and version lists in memory, so going back to
// a source or a secret shows them at once while a fresh copy loads behind.
// Metadata only (names, versions, times) — never values. Nothing is written
// to disk or browser storage.
//
// So a long-running app does not keep growing: entries expire after the
// ttl, a sweep drops expired ones even if they are never asked for again,
// and at most maxEntries are kept (the least recently used go first). Both
// come from the config (cacheSeconds, cacheEntries) via configureCache;
// either at 0 turns the cache off.
import type { Ref, Secret } from './api'
import { type Source, sourceId } from './sources'

export const DEFAULT_TTL_MS = 10 * 60_000
export const DEFAULT_MAX_ENTRIES = 500
const MAX_SWEEP_MS = 60_000

let ttlMs = DEFAULT_TTL_MS
let maxEntries = DEFAULT_MAX_ENTRIES
const off = () => ttlMs <= 0 || maxEntries <= 0
// sweep at least once a minute, more often for short ttls
const sweepMs = () => Math.max(1000, Math.min(MAX_SWEEP_MS, ttlMs))

type Entry = { list: Secret[]; at: number }

// a Map keeps insertion order; re-inserting on use makes the first key the least recently used
const store = new Map<string, Entry>()
let sweeper: ReturnType<typeof setInterval> | undefined

const expired = (e: Entry, now: number) => now - e.at > ttlMs

function sweep(now = Date.now()) {
  for (const [k, e] of store) if (expired(e, now)) store.delete(k)
  if ((store.size === 0 || off()) && sweeper !== undefined) {
    clearInterval(sweeper)
    sweeper = undefined
  }
}

function trim() {
  while (store.size > Math.max(0, maxEntries)) store.delete(store.keys().next().value!)
}

/** Applies cacheSeconds and cacheEntries from the config; 0 for either turns the cache off and empties it. */
export function configureCache(ttlSeconds: number, entries: number) {
  ttlMs = ttlSeconds * 1000
  maxEntries = entries
  if (sweeper !== undefined) {
    clearInterval(sweeper)
    sweeper = undefined
  }
  if (off()) store.clear()
  else {
    sweep()
    trim()
    if (store.size > 0) sweeper = setInterval(sweep, sweepMs())
  }
}

export const listKey = (s: Source) => `list ${sourceId(s)}`
export const versionsKey = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => `versions ${r.backend} ${r.parent} ${r.name}`

export const metaCache = {
  get(key: string): Secret[] | undefined {
    if (off()) return undefined
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
    if (off()) return
    store.delete(key)
    store.set(key, { list, at: Date.now() })
    trim()
    sweeper ??= setInterval(sweep, sweepMs())
  },
  delete: (key: string) => void store.delete(key),
  clear() {
    store.clear()
    sweep()
  },
  /** entries held, for tests */
  size: () => store.size,
}
