// Lists of secrets by source and name (favourites, recents, watched), as
// kept in the config. Names only: these never hold values.
import type { Ref, SecretRef } from './api'

export const refKey = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => `${r.backend}:${r.parent}/${r.name}`

export const toSecretRef = (r: Pick<Ref, 'backend' | 'parent' | 'name'>): SecretRef => ({ backend: r.backend, parent: r.parent, name: r.name })

export const hasRef = (list: SecretRef[], r: Pick<Ref, 'backend' | 'parent' | 'name'>) => list.some((x) => refKey(x) === refKey(r))

/** The list with r added at the end, or removed if it was there. */
export function toggleRef(list: SecretRef[], r: Pick<Ref, 'backend' | 'parent' | 'name'>): SecretRef[] {
  return hasRef(list, r) ? list.filter((x) => refKey(x) !== refKey(r)) : [...list, toSecretRef(r)]
}

/** The list without r. */
export const withoutRef = (list: SecretRef[], r: Pick<Ref, 'backend' | 'parent' | 'name'>) => list.filter((x) => refKey(x) !== refKey(r))

/** The list with r moved (or added) to the front, at most max long. */
export function pushRecent(list: SecretRef[], r: Pick<Ref, 'backend' | 'parent' | 'name'>, max = 10): SecretRef[] {
  return [toSecretRef(r), ...list.filter((x) => refKey(x) !== refKey(r))].slice(0, max)
}
