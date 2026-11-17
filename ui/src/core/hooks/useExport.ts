import { useState } from 'react'
import type { Ref } from '../api'
import { saveToFile } from '../exportfile'
import { protectedFor, useSettings, typedConfirm } from '../settings'
import { errText } from './useApp'

/**
 * "Save to file…": a confirmation step first (the file holds the value as
 * plain text), with the confirm word typed for protected secrets. `ref` names the
 * exact version shown.
 */
export function useExport(ref: Ref, onDone: (msg: string) => void) {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isProtected = protectedFor(settings, ref)
  const confirmed = !isProtected || typedConfirm(typed)

  const start = () => {
    setOpen(true)
    setTyped('')
    setError('')
  }
  const cancel = () => setOpen(false)

  const save = async () => {
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      const r = await saveToFile(ref, isProtected ? ref.name : undefined)
      if ('cancelled' in r) return
      setOpen(false)
      onDone('path' in r ? `Saved to ${r.path}` : `Downloaded ${r.downloaded}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return { open, start, cancel, typed, setTyped, isProtected, confirmed, busy, error, save }
}

export type ExportState = ReturnType<typeof useExport>
