// Settings from the config file that change behaviour, and the policy
// helpers built on them. The core enforces read-only and protection on its
// own; the ui uses these to hide or gate actions before the core refuses.
import { createContext, useContext } from 'react'
import type { Config, EnvOrder, Ref } from './api'
import { sourceId } from './sources'
import { stamp } from './time'

export type Settings = Omit<Config, 'skin' | 'theme' | 'path'>

export const DEFAULT_SETTINGS: Settings = {
  timeZone: 'local',
  envOrder: 'sorted',
  readOnly: false,
  protect: [],
  revealSeconds: 60,
  lockAfterMinutes: 0,
  clipboardClearSeconds: 30,
  cacheSeconds: 600,
  cacheEntries: 500,
  zoom: 100,
  auditLog: '',
  credentials: {},
  sources: [],
  favorites: [],
  recent: [],
  recentCollapsed: false,
  sidebarCollapsed: false,
  watch: [],
  watchMinutes: 5,
  allowScreenCapture: false,
  allowUniversalClipboard: false,
  listen: '',
  openBrowser: false,
}

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

export const useSettings = () => useContext(SettingsContext)

/** Settings a view can change from where it is used; saved to the config file. */
export type SettingsActions = { setEnvOrder: (o: EnvOrder) => void }

export const SettingsActionsContext = createContext<SettingsActions>({ setEnvOrder: () => {} })

export const useSettingsActions = () => useContext(SettingsActionsContext)

/** Formats a timestamp in the configured zone (local or utc). */
export function useStamp(): (iso: string) => string {
  const { timeZone } = useSettings()
  return (iso) => stamp(iso, timeZone)
}

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

/** The word typed to confirm saving a protected secret, saving one to a file, and every delete. */
export const CONFIRM_WORD = 'confirm'

/** True when what was typed is the confirm word; case and spaces around it don't matter. */
export const typedConfirm = (typed: string) => typed.trim().toLowerCase() === CONFIRM_WORD

/** Saving this secret, also to a file, needs the confirm word typed (deleting any secret always does). */
export function protectedFor(s: Settings, r: Pick<Ref, 'backend' | 'parent' | 'name'>): boolean {
  const pats = [...s.protect, ...(sourceFor(s, r)?.protect ?? [])]
  return pats.some((p) => globToRegExp(p).test(r.name))
}
