// berglas-ui:// links: open the mac app at a secret. A link carries the
// source and the name only, never a value, so it is safe in tickets and chat.
import type { Ref } from './api'

export function linkFor(r: Pick<Ref, 'backend' | 'parent' | 'name'>): string {
  const q = new URLSearchParams({ backend: r.backend, parent: r.parent, name: r.name })
  return `berglas-ui://open?${q.toString()}`
}
