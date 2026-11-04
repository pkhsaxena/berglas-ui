// A source is a place to scan for secrets: a bucket (storage) or a project
// (secret manager). The list is a per-device convenience kept in
// localStorage; it holds names only, never values.

import type { Backend } from './api'

export type Source = { backend: Backend; parent: string }

const KEY = 'berglas-ui.sources'

export const sourceId = (s: Source) => `${s.backend}:${s.parent}`

export function loadSources(): Source[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (Array.isArray(v)) {
      return v.filter(
        (s): s is Source => (s?.backend === 'storage' || s?.backend === 'sm') && typeof s?.parent === 'string' && s.parent !== '',
      )
    }
  } catch {
    // unreadable or blocked: start empty
  }
  return []
}

export function saveSources(list: Source[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // not persisted; still usable this session
  }
}
