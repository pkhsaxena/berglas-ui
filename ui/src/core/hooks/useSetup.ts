import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Backend, type ConfigPatch } from '../api'
import { onCommand } from '../commands'
import { claim, useOverlay } from '../overlays'
import type { Settings } from '../settings'
import { groupFit, type GroupFit, parseSourceLines, protectCount, protectError, rowErrors, type SetupRow, suggestGroup, suggestProtect, toSource } from '../setup'
import { type Source, sourceId } from '../sources'
import { errText } from './useApp'

export type SetupStep = 'sources' | 'safety' | 'review'

/** What listing a source found: its names (metadata only, never values), or why it failed. */
export type SourceCheck = { state: 'checking' } | { state: 'ok'; names: string[] } | { state: 'error'; error: string }

/** Choices for locking after a while without input, in minutes (0 never locks). */
export const LOCK_CHOICES = [0, 5, 15, 30, 60] as const

/** Where the setup proposes the audit log when the config has none. */
export const DEFAULT_AUDIT_LOG = '~/.berglas-ui/audit.log'

type Host = {
  /** the core is up with working credentials, so sources can be listed */
  enabled: boolean
  sources: Source[]
  settings: Settings
  saveSettings: (patch: ConfigPatch) => Promise<void>
  /** a demo's throwaway config: no audit log is offered, it would write to the real one in your home folder */
  demo: boolean
  /** after saving: the first source the setup added, to open it */
  onDone: (first: Source) => void
}

let nextKey = 1
const blankRow = (backend: Backend = 'storage', parent = ''): SetupRow => ({ key: nextKey++, backend, parent, label: '', group: '', kmsKey: '', readOnly: false })

/**
 * The setup guide: opens by itself when no source is configured yet (once a
 * run; "Skip" leaves it closed), and from ⌘K or the sources pane at any
 * time. Three steps: sources (typed or pasted, several at once, each listed
 * as soon as it is complete to show it is reachable and to suggest how its
 * names group), safety (protected names, suggested from those groups and
 * counted against the names found; locking; the audit log), and a review.
 * Nothing is written until Save on the review, which is one config write.
 */
export function useSetup(host: Host) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<SetupStep>('sources')
  const [rows, setRows] = useState<SetupRow[]>(() => [blankRow()])
  const [paste, setPaste] = useState('')
  const [pasteKind, setPasteKind] = useState<Backend>('storage')
  const [pasteNote, setPasteNote] = useState('')
  /** listing results by source id, so editing a row back does not list it again */
  const [checks, setChecks] = useState<Record<string, SourceCheck>>({})
  /** rows whose group the person set; a suggestion never overwrites those */
  const [groupTouched, setGroupTouched] = useState<Set<number>>(() => new Set())
  const [protect, setProtect] = useState<string[]>([])
  const [protectDraft, setProtectDraft] = useState('')
  const [protectNote, setProtectNote] = useState('')
  const [lockAfterMinutes, setLockAfterMinutes] = useState(0)
  const [audit, setAudit] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dismissed = useRef(false)
  const hostRef = useRef(host)
  hostRef.current = host

  const show = useCallback(() => {
    if (!claim('setup')) return
    const h = hostRef.current
    setStep('sources')
    setRows([blankRow()])
    setPaste('')
    setPasteNote('')
    setGroupTouched(new Set())
    setProtect([...h.settings.protect])
    setProtectDraft('')
    setProtectNote('')
    setLockAfterMinutes(h.settings.lockAfterMinutes)
    setAudit(!h.demo)
    setError('')
    setOpen(true)
  }, [])

  const close = () => {
    dismissed.current = true
    setOpen(false)
  }
  // Esc waits for a save in progress
  useOverlay('setup', 'panel', open, { close, escape: () => !saving && close() })

  // a fresh install: nothing to look at until a source is added
  useEffect(() => {
    if (host.enabled && host.sources.length === 0 && !dismissed.current && !open) show()
  }, [host.enabled, host.sources.length, open, show])

  useEffect(() => onCommand('setup', () => hostRef.current.enabled && show()), [show])

  const errors = useMemo(() => rowErrors(rows, host.sources), [rows, host.sources])
  /** rows with something typed; a blank row is just room for the next one */
  const filled = rows.map((r, i) => ({ r, err: errors[i] })).filter(({ r }) => r.parent.trim() !== '' || r.label.trim() !== '' || r.group.trim() !== '' || r.kmsKey.trim() !== '')

  // list each complete row once, shortly after typing stops
  const checksRef = useRef(checks)
  checksRef.current = checks
  useEffect(() => {
    if (!open || !host.enabled) return
    const todo = rows.filter((r, i) => !errors[i] && !checksRef.current[sourceId({ backend: r.backend, parent: r.parent.trim() })])
    if (!todo.length) return
    const t = window.setTimeout(() => {
      for (const r of todo) {
        const id = sourceId({ backend: r.backend, parent: r.parent.trim() })
        if (checksRef.current[id]) continue
        setChecks((c) => ({ ...c, [id]: { state: 'checking' } }))
        api
          .list(r.backend, r.parent.trim())
          .then((secrets) => setChecks((c) => ({ ...c, [id]: { state: 'ok', names: secrets.map((s) => s.name) } })))
          .catch((e) => setChecks((c) => ({ ...c, [id]: { state: 'error', error: errText(e) } })))
      }
    }, 500)
    return () => window.clearTimeout(t)
  }, [open, host.enabled, rows, errors])

  const checkOf = (r: SetupRow): SourceCheck | null => checks[sourceId({ backend: r.backend, parent: r.parent.trim() })] ?? null
  const namesOf = (r: SetupRow): string[] => {
    const c = checkOf(r)
    return c?.state === 'ok' ? c.names : []
  }

  // once a source's names are in, propose a group pattern for it (unless one was typed)
  useEffect(() => {
    setRows((list) => {
      let changed = false
      const next = list.map((r) => {
        if (r.group || groupTouched.has(r.key)) return r
        const c = checks[sourceId({ backend: r.backend, parent: r.parent.trim() })]
        if (c?.state !== 'ok') return r
        const s = suggestGroup(c.names)
        if (!s) return r
        changed = true
        return { ...r, group: s.pattern }
      })
      return changed ? next : list
    })
  }, [checks, groupTouched])

  const update = (key: number, change: Partial<SetupRow>) => {
    if ('group' in change) setGroupTouched((s) => new Set(s).add(key))
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)))
  }
  const addRow = (backend: Backend = 'storage') => setRows((list) => [...list, blankRow(backend)])
  const removeRow = (key: number) => setRows((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : [blankRow()]))

  /** Adds pasted sources as rows; ones already listed or configured are skipped and counted. */
  const addPasted = () => {
    const found = parseSourceLines(paste, pasteKind)
    if (!found.length) return setPasteNote('nothing to add — one bucket or project per line')
    const have = new Set([...host.sources.map(sourceId), ...rows.filter((r) => r.parent.trim()).map((r) => sourceId({ backend: r.backend, parent: r.parent.trim() }))])
    const fresh = found.filter((f) => {
      const id = sourceId(f)
      if (have.has(id)) return false
      have.add(id)
      return true
    })
    const skipped = found.length - fresh.length
    setRows((list) => [...list.filter((r) => r.parent.trim() || r.label.trim() || r.group.trim() || r.kmsKey.trim()), ...fresh.map((f) => blankRow(f.backend, f.parent))])
    setPaste('')
    setPasteNote(`added ${fresh.length}${skipped ? ` · ${skipped} already listed` : ''}`)
  }

  /** every name found across the sources being added, for counting protect patterns */
  const allNames = filled.flatMap(({ r }) => namesOf(r))
  const fits: GroupFit[] = filled.filter(({ r }) => r.group.trim()).map(({ r }) => groupFit(r.group.trim(), namesOf(r)))
  const suggestions = suggestProtect(
    [...new Set(fits.map((f) => f.pattern))],
    [...new Set(fits.flatMap((f) => f.envs))],
  )
    // once names are in, a pattern that covers none of them is only noise
    .filter((p) => !protect.includes(p) && (allNames.length === 0 || (protectCount(p, allNames) ?? 0) > 0))

  const addProtect = (pattern = protectDraft) => {
    const p = pattern.trim()
    const err = protectError(p)
    if (err) return setProtectNote(err)
    if (protect.includes(p)) return setProtectNote('already in the list')
    setProtect((l) => [...l, p])
    setProtectDraft('')
    setProtectNote('')
  }
  const removeProtect = (p: string) => setProtect((l) => l.filter((x) => x !== p))

  const canNext = filled.length > 0 && filled.every(({ err }) => !err)
  const next = () => {
    if (step === 'sources') {
      if (!filled.length) return setError('add at least one bucket or project')
      if (!canNext) return setError('fix the rows marked in red first')
      setError('')
      setStep('safety')
    } else if (step === 'safety') {
      setError('')
      setStep('review')
    }
  }
  const back = () => {
    setError('')
    setStep(step === 'review' ? 'safety' : 'sources')
  }

  const newSources = filled.filter(({ err }) => !err).map(({ r }) => toSource(r))
  const auditOn = audit && !host.demo
  const auditLog = host.settings.auditLog || (auditOn ? DEFAULT_AUDIT_LOG : '')

  /** Writes everything in one config write; nothing changes if the core refuses a value. */
  const save = async () => {
    if (!newSources.length || saving) return
    setSaving(true)
    setError('')
    try {
      const patch: ConfigPatch = { sources: [...host.sources, ...newSources], protect, lockAfterMinutes }
      if (!host.settings.auditLog && auditOn) patch.auditLog = DEFAULT_AUDIT_LOG
      await host.saveSettings(patch)
      dismissed.current = true
      setOpen(false)
      host.onDone(newSources[0])
    } catch (e) {
      setError(`not saved — ${errText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return {
    open,
    show,
    close,
    step,
    next,
    back,
    canNext,
    rows,
    errors,
    update,
    addRow,
    removeRow,
    checkOf,
    namesOf,
    paste,
    setPaste,
    pasteKind,
    setPasteKind,
    pasteNote,
    addPasted,
    protect,
    protectDraft,
    setProtectDraft,
    protectNote,
    addProtect,
    removeProtect,
    suggestions,
    /** how many of the names found a pattern covers (null: nothing listed yet or a bad pattern) */
    countFor: (p: string) => (allNames.length ? protectCount(p, allNames) : null),
    lockAfterMinutes,
    setLockAfterMinutes,
    /** the config already names an audit log, so the setup leaves it as it is */
    auditFixed: !!host.settings.auditLog,
    /** the demo offers no audit log */
    demo: host.demo,
    audit,
    setAudit,
    auditLog,
    newSources,
    /** rows going in whose listing failed: saved anyway, and named in the review */
    unreachable: filled.filter(({ r, err }) => !err && checkOf(r)?.state === 'error').map(({ r }) => r.parent.trim()),
    saving,
    error,
    save,
  }
}

export type Setup = ReturnType<typeof useSetup>
