import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigPatch } from '../api'
import { onCommand } from '../commands'
import { claim, useOverlay } from '../overlays'
import { inDesktop } from '../desktop'
import type { Settings } from '../settings'
import {
  type Change,
  draftChanges,
  draftPatch,
  type Field,
  type FieldKey,
  type FieldValues,
  fieldFor,
  listText,
  parseList,
  parseNumber,
  type SafetyDraft,
  type SafetyKey,
  type SourceDetail,
  type SourceSafety,
  visibleSections,
  withSourceDetail,
} from '../settingsModel'
import { type Source, sourceId, sourceName } from '../sources'
import type { TimeZone } from '../time'
import type { EnvOrder } from '../api'
import { errText } from './useApp'

/** What the screen needs from the app (useApp) and the skin. */
export type SettingsHost = {
  /** false while there is no config to show (not paired, core down) */
  enabled: boolean
  settings: Settings
  sources: Source[]
  /** the skin in use and the theme it shows (its own fallback applied) */
  skin: string
  theme: string
  zoom: number
  recentCollapsed: boolean
  sidebarCollapsed: boolean
  setSkin: (name: string) => void
  setTheme: (name: string) => void
  setZoom: (percent: number) => void
  setTimeZone: (z: TimeZone) => void
  setEnvOrder: (o: EnvOrder) => void
  setRecentCollapsed: (v: boolean) => void
  setSidebarCollapsed: (v: boolean) => void
  saveSettings: (patch: ConfigPatch) => Promise<void>
  onToast: (msg: string) => void
}

/**
 * The settings screen's state. Opens on ⌘, / Ctrl+, and on the 'settings'
 * command (the mac app's Go → Settings…). Holds no markup.
 *
 * Ordinary settings are saved as they change (`set`). Safety settings go
 * into a draft instead: `changes` lists what differs from the saved values,
 * `requestSave` asks for the one confirmation and `confirmSave` writes them
 * all in one save. Closing with a draft asks before throwing it away.
 */
export function useSettingsScreen(h: SettingsHost) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<SafetyDraft>({})
  // 'confirm': the one confirmation before a safety save; 'leaving': closing with unsaved safety edits
  const [stage, setStage] = useState<'edit' | 'confirm' | 'leaving'>('edit')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // what is typed in a field but is not a value yet (a letter in a number): shown at the field, and no safety save while one is there
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  // a save the core refused or could not write, by field
  const [errors, setErrors] = useState<Record<string, string>>({})
  // restart-only settings changed since the screen's page loaded
  const [changed, setChanged] = useState<Record<string, true>>({})
  // bumped when fields must show the saved values again (after a save or a discard)
  const [rev, setRev] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const saved: FieldValues = useMemo(
    () => ({
      skin: h.skin,
      theme: h.theme,
      zoom: h.zoom,
      timeZone: h.settings.timeZone,
      envOrder: h.settings.envOrder,
      recentCollapsed: h.recentCollapsed,
      sidebarCollapsed: h.sidebarCollapsed,
      readOnly: h.settings.readOnly,
      protect: h.settings.protect,
      lockAfterMinutes: h.settings.lockAfterMinutes,
      revealSeconds: h.settings.revealSeconds,
      clipboardClearSeconds: h.settings.clipboardClearSeconds,
      allowScreenCapture: h.settings.allowScreenCapture,
      allowUniversalClipboard: h.settings.allowUniversalClipboard,
      auditLog: h.settings.auditLog,
      cacheSeconds: h.settings.cacheSeconds,
      cacheEntries: h.settings.cacheEntries,
      watchMinutes: h.settings.watchMinutes,
      listen: h.settings.listen,
      openBrowser: h.settings.openBrowser,
    }),
    [h.skin, h.theme, h.zoom, h.recentCollapsed, h.sidebarCollapsed, h.settings],
  )

  const changes: Change[] = useMemo(() => draftChanges(saved, h.sources, draft), [saved, h.sources, draft])
  const dirty = changes.length > 0
  const hasInvalid = Object.keys(invalid).length > 0

  const reset = useCallback(() => {
    setDraft({})
    setInvalid({})
    setSaveError('')
    setStage('edit')
    setRev((n) => n + 1)
  }, [])

  const show = useCallback(() => {
    if (!h.enabled || !claim('settings')) return
    setQuery('')
    setErrors({})
    setOpen(true)
  }, [h.enabled])

  /** Closes, unless safety edits are unsaved: then it asks first (stage 'leaving') and returns false. */
  const close = useCallback(() => {
    if (dirty || hasInvalid) {
      setStage('leaving')
      return false
    }
    setOpen(false)
    return true
  }, [dirty, hasInvalid])

  /** Throws the unsaved safety edits away and closes. */
  const discardAndClose = () => {
    reset()
    setOpen(false)
  }

  useEffect(() => onCommand('settings', () => (open ? close() : show())), [open, show, close])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        if (open) close()
        else show()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, show, close])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // while the screen is open, Find (⌘F, the mac app's Find menu) is its own
  // search box, not the window-wide find bar; next / previous do nothing
  useEffect(() => {
    if (!open) return
    const focusSearch = () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    const offs = [onCommand('find', focusSearch, 1), onCommand('findNext', () => {}, 1), onCommand('findPrev', () => {}, 1)]
    // a browser keeps ⌘F for itself unless the page takes it; take it only while open
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // nothing to show any more (the core went away): the draft goes with the screen
  useEffect(() => {
    if (!h.enabled && open) {
      reset()
      setOpen(false)
    }
  }, [h.enabled, open, reset])

  const noteError = (id: string, msg: string) => setErrors((e) => (msg ? { ...e, [id]: msg } : without(e, id)))
  const noteInvalid = (id: string, msg: string) => setInvalid((e) => (msg ? (e[id] === msg ? e : { ...e, [id]: msg }) : id in e ? without(e, id) : e))

  /** Saves ordinary settings now; a failure shows at the field `id`. */
  const saveNow = (id: string, patch: ConfigPatch, restart = false) => {
    noteError(id, '')
    h.saveSettings(patch).then(
      () => {
        if (restart) setChanged((c) => ({ ...c, [id]: true }))
      },
      (e) => noteError(id, errText(e)),
    )
  }

  /** The value a field shows: the draft's for a safety setting being edited, else the saved one. */
  const value = <K extends FieldKey>(key: K): FieldValues[K] => ((draft as Partial<FieldValues>)[key] ?? saved[key]) as FieldValues[K]

  /** Changes a setting: into the draft for a safety setting, saved at once otherwise. */
  const set = <K extends FieldKey>(key: K, v: FieldValues[K]) => {
    const f = fieldFor(key)
    if (f.safety) {
      setSaveError('')
      setDraft((d) => ({ ...d, [key as SafetyKey]: v }))
      return
    }
    if (JSON.stringify(v) === JSON.stringify(saved[key])) return
    switch (key) {
      case 'skin':
        return h.setSkin(v as string)
      case 'theme':
        return h.setTheme(v as string)
      case 'zoom':
        return h.setZoom(v as number)
      case 'timeZone':
        return h.setTimeZone(v as TimeZone)
      case 'envOrder':
        return h.setEnvOrder(v as EnvOrder)
      case 'recentCollapsed':
        return h.setRecentCollapsed(v as boolean)
      case 'sidebarCollapsed':
        return h.setSidebarCollapsed(v as boolean)
      default:
        return saveNow(key, { [key]: v } as ConfigPatch, f.restart)
    }
  }

  /** A typed field's text for a value. */
  const textOf = (f: Field, v: unknown): string => (f.kind === 'list' ? listText(v as string[]) : String(v ?? ''))

  const parse = (f: Field, text: string): { ok: true; value: unknown } | { ok: false; error: string } => {
    if (f.kind === 'number') return parseNumber(f, text)
    return { ok: true, value: f.kind === 'list' ? parseList(text) : text.trim() }
  }

  /**
   * Takes what is typed into a number, text or list field and returns what
   * is wrong with it, or ''. A safety field's value goes into the draft as
   * it is typed (and a safety save waits while any of them is not a value).
   * An ordinary field is only checked here; `commit` saves it.
   */
  const type = (key: FieldKey, text: string): string => {
    const f = fieldFor(key)
    const p = parse(f, text)
    if (f.safety) {
      noteInvalid(key, p.ok ? '' : p.error)
      if (p.ok) set(key, p.value as never)
    }
    return p.ok ? '' : p.error
  }

  /** Saves an ordinary typed field (on Enter or when focus leaves it). Returns what is wrong, or ''. */
  const commit = (key: FieldKey, text: string): string => {
    const f = fieldFor(key)
    if (f.safety) return type(key, text)
    const p = parse(f, text)
    if (!p.ok) return p.error
    set(key, p.value as never)
    return ''
  }

  /** One source's safety settings as shown: the draft's where edited. */
  const sourceSafety = (s: Source): Required<SourceSafety> => {
    const d = draft.sources?.[sourceId(s)]
    return { readOnly: d?.readOnly ?? !!s.readOnly, protect: d?.protect ?? s.protect ?? [] }
  }

  const setSourceSafety = (s: Source, change: SourceSafety) => {
    setSaveError('')
    setDraft((d) => ({ ...d, sources: { ...d.sources, [sourceId(s)]: { ...d.sources?.[sourceId(s)], ...change } } }))
  }

  /** Saves a source's label, KMS key, group pattern or default now. */
  const setSourceDetail = (s: Source, change: SourceDetail) => {
    const next = withSourceDetail(h.sources, sourceId(s), change)
    if (JSON.stringify(next) === JSON.stringify(h.sources)) return
    saveNow(`source ${sourceId(s)}`, { sources: next })
  }

  /** Asks for the one confirmation (stage 'confirm'). */
  const requestSave = () => {
    if (dirty && !hasInvalid) setStage('confirm')
  }

  /** Writes every pending safety change in one save. */
  const confirmSave = async () => {
    if (saving || !dirty || hasInvalid) return
    const n = changes.length
    setSaving(true)
    setSaveError('')
    try {
      await h.saveSettings(draftPatch(saved, h.sources, draft))
      if ('allowScreenCapture' in draft && draft.allowScreenCapture !== saved.allowScreenCapture) setChanged((c) => ({ ...c, allowScreenCapture: true }))
      reset()
      h.onToast(n === 1 ? 'Saved 1 safety setting' : `Saved ${n} safety settings`)
    } catch (e) {
      setStage('edit')
      setSaveError(`Not saved — ${errText(e)}. Nothing was changed.`)
    } finally {
      setSaving(false)
    }
  }

  /** Back to editing from the confirmation or the leave question. */
  const back = () => setStage('edit')

  /** Esc: steps back from a question, else closes. */
  const escape = () => {
    if (stage !== 'edit') back()
    else close()
  }
  /** Put on the dialog (Esc from anywhere else reaches `escape` through the overlay stack). */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    escape()
  }
  useOverlay('settings', 'panel', open, { close, escape })

  // a block is found by what it shows too: source names
  const sourceWords = h.sources.map((s) => `${sourceName(s)} ${s.parent}`).join(' ')
  // the browser version's settings mean nothing to the mac app
  const sections = useMemo(() => (open ? visibleSections(query, { sources: sourceWords, sourceSafety: sourceWords }, inDesktop() ? ['browser'] : []) : []), [open, query, sourceWords])

  return {
    open,
    show,
    close,
    query,
    setQuery,
    searchRef,
    sections,
    value,
    set,
    type,
    commit,
    textOf,
    invalid,
    errors,
    /** restart-only settings changed this session: "restart to apply" */
    changed,
    rev,
    sourceSafety,
    setSourceSafety,
    setSourceDetail,
    changes,
    dirty,
    hasInvalid,
    stage,
    requestSave,
    confirmSave,
    back,
    discard: reset,
    discardAndClose,
    saving,
    saveError,
    onKeyDown,
  }
}

function without<T>(o: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = o
  return rest
}

export type SettingsScreen = ReturnType<typeof useSettingsScreen>

/** What the identity block needs: the "act as" options and the switch (useApp.setIdentity). */
export type SettingsIdentity = {
  options: { key: string; label: string; serviceAccount: string; quotaProject: string }[]
  current: string
  serviceAccount: string
  quotaProject: string
  switching: boolean
  /** a switch that failed */
  error: string
  apply: (serviceAccount: string, quotaProject: string) => void
}

/**
 * The text of a typed field (number, text, list). It follows the value while
 * the field is not being typed in, and whenever `rev` changes; while typing,
 * the text is the user's own.
 */
export function useFieldText(canon: string, rev: number) {
  const [text, setText] = useState(canon)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(canon)
  }, [canon])
  useEffect(() => {
    setText(canon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev])
  return {
    text,
    setText,
    onFocus: () => {
      focused.current = true
    },
    /** `valid` false keeps what was typed, so its error stays next to it */
    onBlur: (valid: boolean) => {
      focused.current = false
      if (valid) setText(canon)
    },
  }
}
