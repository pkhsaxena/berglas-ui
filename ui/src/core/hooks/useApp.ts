import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type Config, type ConfigPatch, type EnvOrder, type Ref, type SecretRef, type Status } from '../api'
import { configureCache, metaCache } from '../cache'
import { onCommand } from '../commands'
import { pushRecent, toggleRef, withoutRef } from '../refs'
import { DEFAULT_SETTINGS, type Settings } from '../settings'
import { type Source, sourceId } from '../sources'
import type { TimeZone } from '../time'
import { applyZoom, stepZoom } from '../zoom'

export type Session =
  | { kind: 'loading' }
  | { kind: 'unauthorized' } // browser not paired with this core run
  | { kind: 'offline'; message: string } // core unreachable or broken
  | { kind: 'no-credentials'; status: Status } // core up, google adc missing
  | { kind: 'ready'; status: Status }

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * App-level state: the session with the core, the config file (sources and
 * theme), and which source is open. Holds no markup, so any skin can use it.
 * `theme` is an opaque name; each skin decides what names it understands.
 * `skin` is too: main.tsx resolves it against the skins the build has.
 */
export function useApp() {
  const [session, setSession] = useState<Session>({ kind: 'loading' })
  const [theme, setThemeState] = useState<string | undefined>(undefined)
  const [skin, setSkinState] = useState<string | undefined>(undefined)
  const [sources, setSources] = useState<Source[]>([])
  const [configPath, setConfigPath] = useState('')
  const [configError, setConfigError] = useState('')
  const [active, setActive] = useState<Source | null>(null)
  const [base, setBase] = useState<Omit<Settings, 'sources'>>(DEFAULT_SETTINGS)
  const settings: Settings = useMemo(() => ({ ...base, sources }), [base, sources])

  /** Takes the config as the core has it: on load and after every settings save. */
  const applyConfig = useCallback((config: Config) => {
    const { skin, theme, sources, path, throwaway, ...rest } = config
    setSkinState(skin)
    setThemeState(theme)
    setSources(sources)
    // skins print "saved in …"; a demo's temp path means nothing to anyone
    setConfigPath(throwaway ? 'a throwaway demo config, deleted on exit' : path)
    setBase(rest)
    // the open source keeps its place, with its settings as they now are
    setActive((a) => {
      const same = a ? sources.find((s) => sourceId(s) === sourceId(a)) : undefined
      return same ?? sources.find((s) => s.default) ?? sources[0] ?? null
    })
  }, [])

  /**
   * Saves settings (any number, in one write of the config file) and takes
   * the config the core answers with. Rejects when the core refuses a value
   * or cannot write the file; nothing is changed then.
   */
  const saveSettings = useCallback(
    async (patch: ConfigPatch) => {
      applyConfig(await api.setConfig(patch))
    },
    [applyConfig],
  )

  const load = useCallback(async () => {
    try {
      const [status, config] = await Promise.all([api.status(), api.config()])
      applyConfig(config)
      setSession(status.credentials ? { kind: 'ready', status } : { kind: 'no-credentials', status })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession({ kind: 'unauthorized' })
      else setSession({ kind: 'offline', message: errText(e) })
    }
  }, [applyConfig])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => configureCache(base.cacheSeconds, base.cacheEntries), [base.cacheSeconds, base.cacheEntries])

  useEffect(() => applyZoom(base.zoom), [base.zoom])

  // the latest zoom, so menu steps pressed in quick succession build on each other
  const zoomRef = useRef(base.zoom)
  useEffect(() => {
    zoomRef.current = base.zoom
  }, [base.zoom])

  /** Zooms the whole ui (percent) and saves it to the config. */
  const setZoom = useCallback((zoom: number) => {
    zoomRef.current = zoom
    setBase((b) => ({ ...b, zoom }))
    setConfigError('')
    api.setConfig({ zoom }).catch((e) => setConfigError(`zoom applied but not saved — ${errText(e)}`))
  }, [])

  // the desktop app's View menu
  useEffect(() => {
    const offs = [
      onCommand('zoomIn', () => setZoom(stepZoom(zoomRef.current, 1))),
      onCommand('zoomOut', () => setZoom(stepZoom(zoomRef.current, -1))),
      onCommand('zoomReset', () => setZoom(100)),
    ]
    return () => offs.forEach((off) => off())
  }, [setZoom])

  const retry = () => {
    setSession({ kind: 'loading' })
    void load()
  }

  const saveSources = (list: Source[]) => {
    const before = sources
    setSources(list)
    setConfigError('')
    api.setConfig({ sources: list }).catch((e) => {
      setSources(before)
      setConfigError(`couldn't save the config — ${errText(e)}`)
    })
  }

  /** Returns an error message, or '' when the source was added. */
  const addSource = (s: Source): string => {
    const parent = s.parent.trim()
    if (!parent) return s.backend === 'storage' ? 'enter a bucket name' : 'enter a project id'
    if (/[\s/]/.test(parent)) return 'no spaces or slashes — just the bucket or project id'
    const src = { backend: s.backend, parent }
    if (sources.some((x) => sourceId(x) === sourceId(src))) return 'already added'
    saveSources([...sources, src])
    setActive(src)
    return ''
  }

  const removeSource = (s: Source) => {
    const list = sources.filter((x) => sourceId(x) !== sourceId(s))
    saveSources(list)
    if (active && sourceId(active) === sourceId(s)) setActive(list[0] ?? null)
  }

  const setTimeZone = (timeZone: TimeZone) => {
    setBase((b) => ({ ...b, timeZone }))
    setConfigError('')
    api.setConfig({ timeZone }).catch((e) => setConfigError(`time zone applied but not saved — ${errText(e)}`))
  }

  const setEnvOrder = (envOrder: EnvOrder) => {
    setBase((b) => ({ ...b, envOrder }))
    setConfigError('')
    api.setConfig({ envOrder }).catch((e) => setConfigError(`order applied but not saved — ${errText(e)}`))
  }

  // bumped when the identity changes, so skins reload lists and close the open secret
  const [identityRev, setIdentityRev] = useState(0)
  const [switching, setSwitching] = useState(false)

  /**
   * Acts as another identity (a service account, or "" for your own ADC
   * login) and saves it. Cached lists are dropped: they were read as the
   * old identity, which may see different secrets.
   */
  const setIdentity = async (serviceAccount: string, quotaProject = '') => {
    setConfigError('')
    setSwitching(true)
    try {
      const c = await api.setIdentity(serviceAccount, quotaProject)
      metaCache.clear()
      setBase((b) => ({ ...b, credentials: c.credentials }))
      const status = await api.status()
      setSession(status.credentials ? { kind: 'ready', status } : { kind: 'no-credentials', status })
      setIdentityRev((n) => n + 1)
    } catch (e) {
      setConfigError(`couldn't switch identity — ${errText(e)}`)
    } finally {
      setSwitching(false)
    }
  }

  /** Saves one of the name lists (favourites, recents, watched); the screen updates first. */
  const saveRefs = (key: 'favorites' | 'recent' | 'watch', list: SecretRef[]) => {
    setBase((b) => ({ ...b, [key]: list }))
    api.setConfig({ [key]: list }).catch((e) => setConfigError(`couldn't save ${key === 'recent' ? 'recent secrets' : key} — ${errText(e)}`))
  }
  const toggleFavorite = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => saveRefs('favorites', toggleRef(base.favorites, r))
  const toggleWatch = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => saveRefs('watch', toggleRef(base.watch, r))
  /** Takes one secret off the recent list (opening it again puts it back). */
  const removeRecent = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => saveRefs('recent', withoutRef(base.recent, r))
  /** Folds or unfolds the recent list, and saves the choice. */
  const setRecentCollapsed = (recentCollapsed: boolean) => {
    setBase((b) => ({ ...b, recentCollapsed }))
    setConfigError('')
    api.setConfig({ recentCollapsed }).catch((e) => setConfigError(`couldn't save the recent list's state — ${errText(e)}`))
  }
  /** Records an opened secret at the front of the recent list (skipped when it already is first). */
  const noteRecent = (r: Pick<Ref, 'backend' | 'parent' | 'name'>) => {
    const first = base.recent[0]
    if (first && first.backend === r.backend && first.parent === r.parent && first.name === r.name) return
    saveRefs('recent', pushRecent(base.recent, r))
  }

  const setTheme = (name: string) => {
    setThemeState(name)
    setConfigError('')
    api.setConfig({ theme: name }).catch((e) => setConfigError(`theme applied but not saved — ${errText(e)}`))
  }

  /**
   * Saves the skin and reloads, so only the new skin's styles are loaded.
   * Each skin keeps its own theme names, so the theme may fall back.
   */
  const setSkin = (name: string) => {
    setConfigError('')
    api
      .setConfig({ skin: name })
      .then(() => {
        setSkinState(name)
        window.location.reload()
      })
      .catch((e) => setConfigError(`couldn't switch skin — ${errText(e)}`))
  }

  return { session, retry, saveSettings, favorites: base.favorites, recent: base.recent, watch: base.watch, toggleFavorite, toggleWatch, noteRecent, removeRecent, recentCollapsed: base.recentCollapsed, setRecentCollapsed, identity: base.credentials, setIdentity, identityRev, switching, zoom: base.zoom, setZoom, skin, setSkin, theme, setTheme, setTimeZone, setEnvOrder, settings, sources, configPath, configError, addSource, removeSource, active, setActive }
}
