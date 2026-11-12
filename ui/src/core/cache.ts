// Keeps the last secret lists and version lists in memory, so going back to
// a source or a secret shows them at once while a fresh copy loads behind.
// Metadata only (names, versions, times) — never values. Lives as long as
// the page; nothing is written to disk or browser storage.
import type { Ref, Secret } from './api'
import { type Source, sourceId } from './sources'

const store = new Map<string, Secret[]>()

export const listKey = (s: Source) => `list ${sourceId(s)}`
export const versionsKey = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => `versions ${r.backend} ${r.parent} ${r.name}`

export const metaCache = {
  get: (key: string): Secret[] | undefined => store.get(key),
  set: (key: string, list: Secret[]) => void store.set(key, list),
  delete: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}
