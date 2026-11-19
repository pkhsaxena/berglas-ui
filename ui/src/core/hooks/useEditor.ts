import { useState } from 'react'
import { api, ApiError, encodeText, type Ref, type Secret, versionOf } from '../api'
import { type Diff, diffValues, reapplyEnv } from '../diff'
import { lintEnv } from '../envlint'
import { insertKeyAfter, isValidKey, looksLikeEnv, parseEnv, removeLine, setKey, setLineValue } from '../envfile'
import { errText } from './useApp'
import { readValue } from './useSecret'

/**
 * idle → editing → review → saving → (done) idle
 *                     ↑         ↓ 409
 *                     └─── conflict
 */
export type EditPhase = 'idle' | 'loading' | 'editing' | 'review' | 'saving' | 'conflict'

type Loaded = { secret: Secret; text: string }

/**
 * Edits a secret. Nothing is written until save() is called from the review
 * phase, which shows the diff from the loaded value to the draft: that review
 * is the confirmation step. Saving sends the loaded generation/version, so a
 * concurrent save by someone else is rejected instead of overwritten.
 */
/** `latestId` is the newest version id when known fresh, so the load can use the core's prefetched copy. */
export function useEditor(base: Ref, onSaved: (s: Secret) => void, latestId?: string) {
  const [phase, setPhase] = useState<EditPhase>('idle')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'env' | 'raw'>('raw')
  const [error, setError] = useState('')
  const [overlaps, setOverlaps] = useState<string[]>([])
  const [restoredFrom, setRestoredFrom] = useState('')
  /** the dropped file's name, when the draft came from one */
  const [fromFile, setFromFile] = useState('')

  const fail = (e: unknown) => setError(errText(e))

  /**
   * Loads the latest value. With `restore`, the draft starts as that older
   * version's value; with `file`, as a dropped file's text, and the editor
   * opens on the review screen (the diff is the first thing a drop shows).
   * A file that matches the latest value opens in the editor instead, saying
   * so: there is nothing to review unless it is saved unchanged on purpose.
   */
  const start = async (restore?: string, file?: { name: string; text: string }) => {
    setPhase('loading')
    setError('')
    setOverlaps([])
    try {
      const latest = await readValue({ ...base, version: latestId })
      if (latest.value.text === null) throw new Error('binary value — only text secrets can be edited here')
      let text = latest.value.text
      if (restore) {
        const old = await readValue({ ...base, version: restore })
        if (old.value.text === null) throw new Error('that version is binary — it cannot be restored here')
        text = old.value.text
      }
      if (file) text = file.text
      setLoaded({ secret: latest.secret, text: latest.value.text })
      setDraft(text)
      setRestoredFrom(restore ?? '')
      setFromFile(file?.name ?? '')
      setMode(looksLikeEnv(text) ? 'env' : 'raw')
      if (file && text !== latest.value.text) setPhase('review')
      else {
        setPhase('editing')
        if (file) setError(`${file.name} is the same as the current value: nothing changed`)
      }
    } catch (e) {
      fail(e)
      setPhase('idle')
    }
  }

  const cancel = () => {
    setPhase('idle')
    setLoaded(null)
    setDraft('')
    setError('')
    setOverlaps([])
  }

  const tryEdit = (fn: () => string) => {
    try {
      setDraft(fn())
      setError('')
    } catch (e) {
      fail(e)
    }
  }

  const env = mode === 'env' ? parseEnv(draft) : null

  const edits = {
    setText: (t: string) => setDraft(t),
    setLineValue: (i: number, v: string) => tryEdit(() => setLineValue(draft, i, v)),
    removeLine: (i: number) => tryEdit(() => removeLine(draft, i)),
    /**
     * Adds a key after line `afterLine` (e.g. a section's last key), or at
     * the end of the file. Returns an error message, or '' when added.
     */
    addKey: (key: string, value: string, afterLine?: number): string => {
      const k = key.trim()
      if (!isValidKey(k)) return 'keys are letters, digits, _ . - and cannot start with a digit'
      if (parseEnv(draft).some((l) => l.kind === 'pair' && l.key === k)) return `${k} already exists — edit its value instead`
      tryEdit(() => (afterLine === undefined ? setKey(draft, k, value) : insertKeyAfter(draft, afterLine, k, value)))
      return ''
    },
    /** Sets several keys at once (rewrites existing ones, appends new ones). */
    setKeys: (pairs: { key: string; value: string }[]) => tryEdit(() => pairs.reduce((t, p) => setKey(t, p.key, p.value), draft)),
  }

  const diff: Diff | null = loaded && (phase === 'review' || phase === 'saving' || phase === 'conflict')
    ? diffValues(loaded.text, draft, looksLikeEnv(loaded.text) && looksLikeEnv(draft))
    : null

  /** the draft is exactly the loaded value */
  const unchanged = !!loaded && draft === loaded.text

  /**
   * Shows the diff before saving. An unchanged draft is refused unless
   * `resave` asks to write the same value again as a new version: something
   * that watches for new versions (a cluster's secret sync, say) then picks
   * the secret up again. It is reviewed and confirmed like any other save.
   */
  const review = (resave = false) => {
    if (!loaded) return
    if (unchanged && !resave) return setError('nothing changed')
    setError('')
    setPhase('review')
  }

  /** `confirm` is the secret's name, sent once the user has typed the confirm word; required by the core when the name is protected. */
  const save = async (confirm?: string) => {
    if (!loaded || phase !== 'review') return
    setPhase('saving')
    setError('')
    const s = loaded.secret
    try {
      const saved = await api.update({
        backend: base.backend,
        parent: base.parent,
        name: base.name,
        plaintext: encodeText(draft),
        ...(base.backend === 'storage'
          ? { expectedGeneration: s.generation, expectedMetageneration: s.metageneration }
          : { expectedVersion: s.version }),
      }, confirm)
      cancel()
      onSaved(saved)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'modified') {
        setPhase('conflict')
        setError(e.message)
      } else {
        fail(e)
        setPhase('review')
      }
    }
  }

  /** After a conflict: replay this draft's key changes onto the new latest (.env only). */
  const canReapply = !!loaded && looksLikeEnv(loaded.text) && looksLikeEnv(draft)
  const reapply = async () => {
    if (!loaded) return
    setError('')
    try {
      const latest = await readValue({ ...base, version: undefined })
      if (latest.value.text === null) throw new Error('the latest version is binary')
      const r = reapplyEnv(loaded.text, draft, latest.value.text)
      setLoaded({ secret: latest.secret, text: latest.value.text })
      setDraft(r.text)
      setOverlaps(r.overlaps)
      setPhase(r.text === latest.value.text ? 'editing' : 'review')
      if (r.text === latest.value.text) setError('the latest version already has all your changes')
    } catch (e) {
      fail(e)
    }
  }

  /** After a conflict: drop the draft and start again from the latest. */
  const restart = () => start()

  return {
    phase,
    loadedVersion: loaded ? versionOf(loaded.secret) : '',
    restoredFrom,
    fromFile,
    /** duplicate keys and empty values in the draft (shown at review; they never block a save) */
    warnings: phase === 'review' || phase === 'saving' ? lintEnv(draft, loaded?.text ?? '') : [],
    draft,
    mode,
    setMode,
    env,
    edits,
    error,
    overlaps,
    diff,
    start,
    cancel,
    review: () => review(),
    /** review an unchanged draft, to save the same value as a new version */
    resave: () => review(true),
    unchanged,
    backToEdit: () => setPhase('editing'),
    save,
    canReapply,
    reapply,
    restart,
  }
}
