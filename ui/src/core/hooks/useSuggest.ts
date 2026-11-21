import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { autoPair as pairEdit } from '../autopair'
import type { ComboOption } from './useCombo'

/**
 * Which suggestions show for what is in the field: all of them while it is
 * empty or holds one of them exactly (so the others are there to switch to),
 * otherwise those whose label contains the text, in any case. None matching
 * hides the list, so it never covers what is being typed.
 */
export function suggestShown(options: ComboOption[], value: string): ComboOption[] {
  const v = value.trim().toLowerCase()
  if (!v || options.some((o) => o.value.toLowerCase() === v)) return options
  return options.filter((o) => o.label.toLowerCase().includes(v))
}

/**
 * A text field with suggestions under it, in the dropdowns' style: whatever
 * is typed is the value; the list (each suggestion with a hint) opens when
 * the field is clicked, typed in, or on ↓, and narrows as it is typed in.
 * ↑↓ move, Enter or a click fills the field with a suggestion (still free to
 * edit), Esc closes the list and keeps the text. With `autoPair`, brackets
 * close themselves (see autopair.ts). Holds no markup; a skin renders it
 * (see the skins' SuggestInput).
 */
export function useSuggest({ value, onChange, options, autoPair }: { value: string; onChange: (value: string) => void; options: ComboOption[]; autoPair?: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(-1)
  // where the list goes, in viewport pixels: under the field and at least as wide (the list is
  // position: fixed, so a scrolling dialog body can't clip it)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const rootRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  // where the caret goes once a bracket edit has rendered
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (caret.current === null || !inputRef.current) return
    inputRef.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [value])
  const shown = useMemo(() => suggestShown(options, value), [options, value])
  const visible = open && shown.length > 0

  const show = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setIndex(-1)
  }

  // a fixed list would float away from its field: close when anything else scrolls or resizes
  useEffect(() => {
    if (!open) return
    const moved = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    return () => {
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
    }
  }, [open])

  const pick = (o: ComboOption) => {
    close()
    if (o.value !== value) onChange(o.value)
  }

  return {
    visible,
    shown,
    index,
    setIndex,
    pick,
    pos,
    rootRef,
    listId,
    inputProps: {
      ref: inputRef,
      value,
      role: 'combobox' as const,
      'aria-autocomplete': 'list' as const,
      'aria-expanded': visible,
      'aria-controls': listId,
      'aria-activedescendant': visible && index >= 0 ? `${listId}-${index}` : undefined,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value)
        setIndex(-1)
        if (!open) show()
      },
      onClick: () => {
        if (!open) show()
      },
      // a click on a suggestion keeps the focus (its mousedown is prevented), so leaving the field means leaving the list
      onBlur: close,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (autoPair && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing) {
          const el = e.currentTarget
          const edit = pairEdit(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, e.key, autoPair)
          if (edit) {
            e.preventDefault()
            if (edit.value === el.value) el.setSelectionRange(edit.caret, edit.caret) // stepped over a closing bracket
            else {
              caret.current = edit.caret
              onChange(edit.value)
              setIndex(-1)
              if (!open) show()
            }
            return
          }
        }
        const n = shown.length
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          if (!visible) {
            show()
            setIndex(n ? 0 : -1)
          } else if (n) setIndex((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1)))
        } else if (e.key === 'Enter') {
          if (visible && index >= 0 && shown[index]) {
            e.preventDefault()
            pick(shown[index])
          }
        } else if (e.key === 'Escape') {
          if (open) {
            e.preventDefault()
            e.stopPropagation() // the list, not the dialog around it
            close()
          }
        } else if (e.key === 'Tab') close()
      },
      spellCheck: false,
      autoComplete: 'off',
    },
  }
}

export type Suggest = ReturnType<typeof useSuggest>
