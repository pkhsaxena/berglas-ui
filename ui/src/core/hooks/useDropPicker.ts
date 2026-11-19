import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { type DropChoice, dropChoices, dropKey, dropList } from '../droptarget'
import { type DroppedFile, suggestName } from './useFileDrop'

/**
 * The drop dialog's search: where a dropped file goes, as a list to filter
 * (see dropChoices). ↑↓ move, Enter picks, ⌘Enter (Ctrl+Enter) picks the
 * new secret, Esc cancels. Each new drop starts with an empty query and the
 * first secret (the open one, when there is one) selected. Holds no markup; a skin's FileDrop renders it.
 */
export function useDropPicker(o: {
  dropped: DroppedFile | null
  names: string[]
  open: string | null
  writable: boolean
  nameProblem: (name: string) => string
  onChoose: (choice: DropChoice, file: DroppedFile) => void
  onCancel: () => void
}) {
  const [query, setQueryState] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = o.dropped?.id

  useEffect(() => {
    setQueryState('')
    if (id !== undefined) requestAnimationFrame(() => inputRef.current?.focus())
  }, [id])

  const suggested = o.dropped ? suggestName(o.dropped.name) : ''
  const list = useMemo(
    () => dropList(dropChoices({ names: o.names, query, open: o.open, suggested, writable: o.writable, nameProblem: o.nameProblem })),
    // nameProblem is a fresh function each render; it depends only on the source, which `names` follows
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.names, query, o.open, suggested, o.writable],
  )
  const { choices, create, problem } = list
  useEffect(() => setIndex(list.start), [id, query, list.start])

  const setQuery = (q: string) => setQueryState(q)

  const choose = (c: DropChoice | undefined | null) => {
    if (c && o.dropped) o.onChoose(c, o.dropped)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const a = dropKey(list, index, { key: e.key, meta: e.metaKey, ctrl: e.ctrlKey })
    if (!a) return
    e.preventDefault()
    if (a.kind === 'move') setIndex(a.index)
    else if (a.kind === 'choose') choose(a.choice)
    else if (a.kind === 'cancel') {
      e.stopPropagation()
      o.onCancel()
    }
  }

  return {
    query,
    setQuery,
    index: Math.min(index, Math.max(0, choices.length - 1)),
    setIndex,
    /** the new secret first (when one can be made), then the secrets; a skin pins the first under the search box */
    choices,
    /** whether choices[0] is the new secret */
    hasCreate: !!create,
    problem,
    inputRef,
    onKeyDown,
    choose,
  }
}

export type DropPicker = ReturnType<typeof useDropPicker>
