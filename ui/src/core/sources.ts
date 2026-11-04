// A source is a place to scan for secrets: a bucket (storage) or a project
// (secret manager), with its per-source settings. Sources live in the core's
// config file, so they survive restarts even though the core's port, and so
// the page origin, changes.

import type { SourceConfig } from './api'

export type Source = SourceConfig

export const sourceId = (s: Pick<Source, 'backend' | 'parent'>) => `${s.backend}:${s.parent}`

/** What to call a source in the ui: its label, else its bucket or project. */
export const sourceName = (s: Source) => s.label || s.parent
