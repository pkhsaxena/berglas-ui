import { useEffect, useState } from 'react'
import { looksLikeEnv, parseEnv } from '../envfile'
import { claim, useOverlay } from '../overlays'

/** A file dropped onto the window, read as text. Nothing is saved until the user reviews it. */
export type DroppedFile = { id: number; name: string; text: string; size: number; keys: number | null }

/** Bigger files are refused: secrets are small, and the core takes at most 8 MB per request. */
export const MAX_DROP_BYTES = 1 << 20

/**
 * A secret name from a file name: the extension (.env, .txt, .json, .yaml,
 * .yml, .pem) and a leading dot are dropped, other unsafe characters become
 * "-". ".env" alone gives "" (the user names it).
 */
export function suggestName(fileName: string): string {
  let n = fileName.split(/[\\/]/).pop() ?? ''
  n = n.replace(/^\.env$/i, '').replace(/\.(env|txt|json|ya?ml|pem)$/i, '').replace(/^\./, '')
  return n.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

let nextId = 1

/** Reads a dropped file: at most MAX_DROP_BYTES, and valid UTF-8 text. */
export async function readDropped(file: File): Promise<DroppedFile> {
  if (file.size > MAX_DROP_BYTES) throw new Error(`${file.name} is ${Math.round(file.size / 1024)} KB; files over ${MAX_DROP_BYTES >> 10} KB are not taken`)
  const buf = new Uint8Array(await file.arrayBuffer())
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new Error(`${file.name} is not text (only UTF-8 text files can be dropped)`)
  }
  if (text === '') throw new Error(`${file.name} is empty`)
  const keys = looksLikeEnv(text) ? new Set(parseEnv(text).flatMap((l) => (l.kind === 'pair' ? [l.key] : []))).size : null
  return { id: nextId++, name: file.name, text, size: buf.length, keys }
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

/**
 * Files dragged over the window. While `enabled`, `dragging` is true during
 * a drag and a drop is read into `dropped` (or `error`). A dropped file is
 * never opened by the web view, even while disabled.
 */
export function useFileDrop(enabled: boolean) {
  const [dragging, setDragging] = useState(false)
  const [dropped, setDropped] = useState<DroppedFile | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let depth = 0
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
    }
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      if (enabled) setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (!enabled) return
      const files = [...(e.dataTransfer?.files ?? [])]
      // its dialog takes the place of any open panel; none while one won't close (unsaved settings)
      if (files.length && !claim('drop')) return
      if (files.length !== 1) return setError(files.length ? 'drop one file at a time' : '')
      setError('')
      readDropped(files[0]).then(setDropped, (err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [enabled])

  const clear = () => {
    setDropped(null)
    setError('')
  }
  useOverlay('drop', 'panel', !!dropped || !!error, { close: clear })
  return { dragging, dropped, error, clear }
}

export type FileDropState = ReturnType<typeof useFileDrop>
