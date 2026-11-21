import { type ChangeEvent, type KeyboardEvent, useEffect, useState } from 'react'

/**
 * A key name being edited in the editor's table. The rename applies on Enter
 * or when the field loses focus, not on every keystroke: the sorted view
 * would move the row while typing. Esc puts the name back. A name `rename`
 * refuses (invalid, or already set by another line) keeps its text and
 * reason on Enter, so it can be fixed; on leaving the field the old name
 * comes back and the reason stays shown. Holds no markup; a skin's editor
 * renders the input.
 */
export function useKeyInput(k: string, rename: (key: string) => string) {
  const [value, setValue] = useState(k)
  const [error, setError] = useState('')
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
      value,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value)
        setError('')
      },
      onBlur: () => {
        if (commit()) setValue(k)
      },
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
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
      size: Math.max(6, value.length + 1),
      spellCheck: false,
      autoComplete: 'off',
    },
  }
}
