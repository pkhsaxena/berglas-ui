import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onCommand } from '../commands'
import { type PaletteItem, rankItems } from '../palette'

/**
 * The command palette's state. Opens on ⌘K / Ctrl+K anywhere in the page and
 * on the desktop app's Go → Go To… menu ('palette' command). Arrow keys move,
 * Enter runs the highlighted item, Esc closes. Holds no markup. getItems is
 * called while the palette is open (see ../palette.ts paletteItems).
 */
export function usePalette(getItems: () => PaletteItem[]) {
  const [open, setOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // items are built only while open (they read the secret lists and cache)
  const results = useMemo(() => (open ? rankItems(getItems(), query) : []), [open, getItems, query])

  const show = useCallback(() => {
    setQueryState('')
    setIndex(0)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => onCommand('palette', () => (open ? close() : show())), [open, show, close])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close()
        else show()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, show, close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const setQuery = (q: string) => {
    setQueryState(q)
    setIndex(0)
  }

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return
    setOpen(false)
    item.run()
  }

  /** Put on the palette's input. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = results.length
      if (n) setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[index])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return { open, show, close, query, setQuery, results, index: Math.min(index, Math.max(0, results.length - 1)), setIndex, choose, onKeyDown, inputRef }
}

export type PaletteState = ReturnType<typeof usePalette>
