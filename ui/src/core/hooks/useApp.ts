import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type EnvOrder, type Status } from '../api'
import { DEFAULT_SETTINGS, type Settings } from '../settings'
import { type Source, sourceId } from '../sources'
import type { TimeZone } from '../time'

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

  const load = useCallback(async () => {
    try {
      const [status, config] = await Promise.all([api.status(), api.config()])
      const { skin, theme, sources, path, ...rest } = config
      setSkinState(skin)
      setThemeState(theme)
      setSources(sources)
      setConfigPath(path)
      setBase(rest)
      setActive((a) => a ?? sources.find((s) => s.default) ?? sources[0] ?? null)
      setSession(status.credentials ? { kind: 'ready', status } : { kind: 'no-credentials', status })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession({ kind: 'unauthorized' })
      else setSession({ kind: 'offline', message: errText(e) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  return { session, retry, skin, setSkin, theme, setTheme, setTimeZone, setEnvOrder, settings, sources, configPath, configError, addSource, removeSource, active, setActive }
}
