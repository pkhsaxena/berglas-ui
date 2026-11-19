import { useState } from 'react'
import { api, type Ref } from '../api'
import { metaCache, versionsKey } from '../cache'
import { typedConfirm } from '../settings'
import { errText } from './useApp'

/**
 * Deletes a secret and every version of it. Deleting always needs the word
 * "confirm" typed, the same word as saving a protected secret; the secret's
 * name is then sent as the confirmation header, which the core requires for
 * protected names and ignores otherwise.
 */
export function useDelete(base: Ref, onDeleted: () => void) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirmed = typedConfirm(typed)

  const remove = async () => {
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      await api.remove({ backend: base.backend, parent: base.parent, name: base.name }, base.name)
      metaCache.delete(versionsKey(base))
      setOpen(false)
      onDeleted()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    setOpen(false)
    setTyped('')
    setError('')
  }

  return { open, start: () => setOpen(true), cancel, typed, setTyped, confirmed, remove, busy, error }
}
