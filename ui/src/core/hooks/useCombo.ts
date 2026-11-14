import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'

export type ComboOption = { value: string; label: string; hint?: string; disabled?: boolean }

/** Options whose label or hint contains the query, ignoring case; all for an empty query. */
export function filterOptions(options: ComboOption[], query: string): ComboOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.label.toLowerCase().includes(q) || !!o.hint?.toLowerCase().includes(q))
}

/**
 * A dropdown with substring search, in place of the platform's <select>:
 * the button opens a popup with a search box and the options; typing
 * filters, ↑↓ move, Enter picks, Esc or a click outside closes. Holds no
 * markup; a skin renders it (see the skins' Select component).
 */
export function useCombo({ options, value, onChange }: { options: ComboOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [index, setIndex] = useState(0)
  // where the popup goes, in viewport pixels: under the button, and towards
  // the left when the button is near the window's right edge. The popup is
  // position: fixed, so no clipping ancestor (a pane title, a table) cuts it.
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, left: 0 })
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const shown = useMemo(() => filterOptions(options, query), [options, query])
  const current = options.find((o) => o.value === value)

  const show = () => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (r) setPos(r.left + 280 > window.innerWidth ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { top: r.bottom + 4, left: r.left })
    setQueryState('')
    setIndex(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const outside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    // a fixed popup would float away from its button: close when anything else scrolls or resizes
    const moved = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
    }
  }, [open])

  const setQuery = (q: string) => {
    setQueryState(q)
    setIndex(0)
  }

  const choose = (o: ComboOption | undefined) => {
    if (!o || o.disabled) return
    close()
    if (o.value !== value) onChange(o.value)
  }

  /** On the search box. */
  const onInputKeyDown = (e: KeyboardEvent) => {
    const n = shown.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (n) setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(shown[Math.min(index, n - 1)])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  /** On the button: ↓, Enter or Space open it. */
  const onButtonKeyDown = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      show()
    }
  }

  return {
    open,
    toggle: () => (open ? close() : show()),
    close,
    query,
    setQuery,
    shown,
    index: Math.min(index, Math.max(0, shown.length - 1)),
    setIndex,
    choose,
    current,
    pos,
    onInputKeyDown,
    onButtonKeyDown,
    rootRef,
    buttonRef,
    inputRef,
    listId,
  }
}
