import { type ChangeEvent, type KeyboardEvent, useEffect, useState } from 'react'
import { useAutoGrow } from './useAutoGrow'

/**
 * A key name being edited in the editor's table. The rename applies on Enter
 * or when the field loses focus, not on every keystroke: the sorted view
 * would move the row while typing. Esc puts the name back. A name `rename`
 * refuses (invalid, or already set by another line) keeps its text and
 * reason on Enter, so it can be fixed; on leaving the field the old name
 * comes back and the reason stays shown. Like a value (useAutoGrow), the
 * field is a textarea that is as wide as the name up to the skin's cap and
 * then wraps onto more lines, so a long name shows whole without squeezing
 * the value column. A key has no line breaks: Enter applies, and a pasted
 * break is dropped. Holds no markup; a skin's editor renders the textarea.
 */
export function useKeyInput(k: string, rename: (key: string) => string) {
  const [value, setValue] = useState(k)
  const [error, setError] = useState('')
  const ref = useAutoGrow(value)
  useEffect(() => {
    setValue(k)
    setError('')
  }, [k])

  // '' when renamed or unchanged, else why not
  const commit = () => {
    if (value.trim() === k) {
      setValue(k)
      return ''
    }
    const why = rename(value)
    setError(why)
    return why
  }

  return {
    error,
    inputProps: {
      ref,
      value,
      rows: 1,
      onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value.replace(/[\r\n]+/g, ''))
        setError('')
      },
      onBlur: () => {
        if (commit()) setValue(k)
      },
      onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setValue(k)
          setError('')
        }
      },
      'aria-invalid': error ? true : undefined,
      // as wide as the name (one column more for the caret); the skin caps it and the rest wraps
      cols: Math.max(6, value.length + 1),
      spellCheck: false,
      autoComplete: 'off',
    },
  }
}
