import { useCallback, useEffect, useRef, useState } from 'react'
import { api, decodeValue, type Ref, type Secret, versionOf } from '../api'
import { type EnvLine, looksLikeEnv, parseEnv } from '../envfile'
import { errText } from './useApp'

/** A revealed value is dropped from memory after this long. */
export const HIDE_AFTER_MS = 60_000

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
 * change, on unmount and after HIDE_AFTER_MS. Callers should key the
 * component using this hook by secret, so state starts fresh per secret.
 */
export function useSecret(base: Ref) {
  const [versions, setVersions] = useState<Secret[] | null>(null)
  const [versionsError, setVersionsError] = useState('')
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
      setVersions(await api.versions(base))
      setVersionsError('')
    } catch (e) {
      setVersionsError(errText(e))
    }
  }, [base])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  useEffect(() => hide, [hide])

  const latest = versions?.[0]
  const shown = versions?.find((v) => versionOf(v) === version) ?? latest
  const isLatest = !!shown && shown === latest
  const ref: Ref = { ...base, version: version || undefined }

  const selectVersion = (v: string) => {
    hide()
    setVersion(latest && v === versionOf(latest) ? '' : v)
  }

  const reveal = async () => {
    setBusy(true)
    setError('')
    try {
      const { value } = await readValue(ref)
      setRevealed(value)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setRevealed(null), HIDE_AFTER_MS)
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
        const r = (await readValue(ref)).value
        if (r.text === null) throw new Error('binary value — it cannot be copied as text')
        value = r.text
      }
      await navigator.clipboard.writeText(value)
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
