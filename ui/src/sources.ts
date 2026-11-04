// A source is a place to scan for secrets: a bucket (storage) or a project
// (secret manager). Sources live in the core's config file, so they survive
// restarts even though the core's port, and so the page origin, changes.

import type { Backend } from './api'

export type Source = { backend: Backend; parent: string }

export const sourceId = (s: Source) => `${s.backend}:${s.parent}`
