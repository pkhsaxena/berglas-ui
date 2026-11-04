// Settings from the config file that change behaviour, and the policy
// helpers built on them. The core enforces read-only and protection on its
// own; the ui uses these to hide or gate actions before the core refuses.
import { createContext, useContext } from 'react'
import type { Config, Ref } from './api'
import { sourceId } from './sources'

export type Settings = Omit<Config, 'theme' | 'path'>

export const DEFAULT_SETTINGS: Settings = {
  readOnly: false,
  protect: [],
  revealSeconds: 60,
  clipboardClearSeconds: 30,
  auditLog: '',
  credentials: {},
  sources: [],
}

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

export const useSettings = () => useContext(SettingsContext)

type Where = Pick<Ref, 'backend' | 'parent'>

const sourceFor = (s: Settings, w: Where) => s.sources.find((x) => sourceId(x) === sourceId(w))

/** Writes to this bucket or project are refused (global or per-source readOnly). */
export const readOnlyFor = (s: Settings, w: Where) => s.readOnly || !!sourceFor(s, w)?.readOnly

/** The default kms key for new storage secrets here, if configured. */
export const kmsKeyFor = (s: Settings, w: Where) => sourceFor(s, w)?.kmsKey ?? ''

/** Converts a path.Match-style glob (* ? [...]) to a RegExp; * does not cross /. */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end < 0) {
        re += '\\['
        continue
      }
      let cls = glob.slice(i + 1, end)
      if (cls.startsWith('^')) cls = '\\^' + cls.slice(1)
      re += `[${cls.startsWith('!') ? '^' + cls.slice(1) : cls}]`
      i = end
    } else if (c === '\\' && i + 1 < glob.length) re += '\\' + glob[++i]
    else re += c.replace(/[.+^${}()|]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Writing or deleting this secret needs its name typed to confirm. */
export function protectedFor(s: Settings, r: Pick<Ref, 'backend' | 'parent' | 'name'>): boolean {
  const pats = [...s.protect, ...(sourceFor(s, r)?.protect ?? [])]
  return pats.some((p) => globToRegExp(p).test(r.name))
}
