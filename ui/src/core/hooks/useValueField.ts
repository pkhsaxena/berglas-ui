import { type ChangeEvent, type KeyboardEvent, useLayoutEffect, useRef } from 'react'
import { useAutoGrow } from './useAutoGrow'

/**
 * A value in the editor's table: a textarea that grows with its text (see
 * useAutoGrow). Enter adds no line break (it would be easy to add one by
 * mistake) and runs `onEnter` if given; Shift+Enter or a paste does, and the editor then writes the
 * value in quotes (envfile setLineValue). When the value comes back quoted
 * like that, the caret stays where it was instead of jumping to the end.
 * Holds no markup; a skin's editor renders the textarea.
 */
export function useValueField(value: string, onChange: (v: string) => void, onEnter?: () => void) {
  const ref = useAutoGrow(value)
  const typed = useRef<{ text: string; caret: number } | null>(null)

  useLayoutEffect(() => {
    const t = typed.current
    typed.current = null
    const el = ref.current
    if (!t || !el || value === t.text) return
    if (value.length === t.text.length + 2 && value.slice(1, -1) === t.text) el.setSelectionRange(t.caret + 1, t.caret + 1)
  }, [value, ref])

  return {
    ref,
    value,
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
      typed.current = { text: e.target.value, caret: e.target.selectionStart }
      onChange(e.target.value)
    },
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
      e.preventDefault()
      onEnter?.()
    },
    spellCheck: false,
    autoComplete: 'off',
  }
}
