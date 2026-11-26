import { useCallback, useEffect, useRef, useState } from 'react'
import { api, decodeValue, type Ref, type Secret, versionOf } from '../api'
import { metaCache, versionsKey } from '../cache'
import { onRefresh } from '../refresh'
import { copySecret } from '../clipboard'
import { type EnvLine, looksLikeEnv, parseEnv } from '../envfile'
import { useSettings } from '../settings'
import { errText } from './useApp'

/**
 * Starts the auto-hide timer for a revealed value or diff, per the
 * revealSeconds setting (0 = never). Returns the timer id, or undefined.
 */
export function scheduleHide(seconds: number, hide: () => void): number | undefined {
  return seconds > 0 ? window.setTimeout(hide, seconds * 1000) : undefined
}

export type Revealed = {
  version: string
  /** null when the value is not valid utf-8 */
  text: string | null
  size: number
  /** set when the text parses as a .env file */
  env: EnvLine[] | null
}

export async function readValue(ref: Ref): Promise<{ secret: Secret; value: Revealed }> {
  const secret = await api.read(ref)
  const { bytes, text } = decodeValue(secret.plaintext)
  return {
    secret,
    value: { version: versionOf(secret), text, size: bytes.length, env: text !== null && looksLikeEnv(text) ? parseEnv(text) : null },
  }
}

/**
 * One secret: its versions (metadata only), which version is being looked
 * at, and its value once revealed. The value is cleared on hide, on version
 * change, on unmount and after the revealSeconds setting. Copies clear from
 * the clipboard per clipboardClearSeconds; `onNote` hears about that.
 * Callers should key the component using this hook by secret, so state
 * starts fresh per secret. A secret opened before shows its last version
 * list at once (see ../cache) while a fresh one loads.
 */
export function useSecret(base: Ref, onNote: (msg: string) => void = () => {}) {
  const settings = useSettings()
  const [versions, setVersions] = useState<Secret[] | null>(() => metaCache.get(versionsKey(base)) ?? null)
  const [versionsError, setVersionsError] = useState('')
  // the list came from the core just now, not from the cache
  const [versionsFresh, setVersionsFresh] = useState(false)
  const [version, setVersion] = useState('') // '' = latest
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setRevealed(null)
  }, [])

  const loadVersions = useCallback(async () => {
    try {
      const list = await api.versions(base)
      metaCache.set(versionsKey(base), list)
      setVersions(list)
      setVersionsFresh(true)
      setVersionsError('')
    } catch (e) {
      setVersionsError(errText(e))
    }
  }, [base])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])
  // a version saved elsewhere shows up when you come back to the window or click the open secret (../refresh)
  useEffect(() => onRefresh(() => void loadVersions()), [loadVersions])

  useEffect(() => hide, [hide])

  const latest = versions?.[0]
  const shown = versions?.find((v) => versionOf(v) === version) ?? latest
  const isLatest = !!shown && shown === latest
  const ref: Ref = { ...base, version: version || undefined }
  /**
   * The newest version's id once the list is fresh. Reads ask for it instead
   * of "latest": the core has usually downloaded that exact version already
   * (still encrypted), so a reveal only waits for the decrypt.
   */
  const latestId = versionsFresh && latest ? versionOf(latest) : undefined
  const readRef: Ref = { ...base, version: version || latestId }

  const selectVersion = (v: string) => {
    hide()
    setVersion(latest && v === versionOf(latest) ? '' : v)
  }

  const reveal = async () => {
    setBusy(true)
    setError('')
    try {
      const { value } = await readValue(readRef)
      setRevealed(value)
      window.clearTimeout(timer.current)
      timer.current = scheduleHide(settings.revealSeconds, () => setRevealed(null))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  /** Copies text, or the shown version's value when no text is given. Resolves true on success. */
  const copy = async (text?: string): Promise<boolean> => {
    setError('')
    try {
      let value = text
      if (value === undefined) {
        setBusy(true)
        const r = (await readValue(readRef)).value
        if (r.text === null) throw new Error('binary value — it cannot be copied as text')
        value = r.text
      }
      await copySecret(value, settings.clipboardClearSeconds, onNote)
      return true
    } catch (e) {
      setError(`couldn't copy — ${errText(e)}`)
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    ref,
    versions,
    versionsError,
    reloadVersions: loadVersions,
    latest,
    latestId,
    shown,
    isLatest,
    selectVersion,
    revealed,
    reveal,
    hide,
    copy,
    busy,
    error,
  }
}
