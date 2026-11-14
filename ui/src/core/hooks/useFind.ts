import { useCallback, useEffect, useRef, useState } from 'react'
import { onCommand } from '../commands'
import { clearPaint, findRanges, paint, reveal } from '../find'

/**
 * Find in page (see ../find.ts). Opened by the desktop app's Edit → Find
 * (⌘F) through the 'find' command; ⌘G / ⇧⌘G step through matches. Matches
 * follow the page as it changes. Holds no markup: a skin renders the bar.
 */
export function useFind() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const ranges = useRef<Range[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const indexRef = useRef(0)

  const search = useCallback(
    (keepIndex: boolean) => {
      const root = document.getElementById('root')
      const found = root && open ? findRanges(root, query) : []
      ranges.current = found
      const i = found.length === 0 ? 0 : keepIndex ? Math.min(indexRef.current, found.length - 1) : 0
      indexRef.current = i
      setCount(found.length)
      setIndex(i)
      if (found.length) paint(found, i)
      else clearPaint()
      return found
    },
    [open, query],
  )

  // a new query starts at the first match
  useEffect(() => {
    reveal(search(false)[0])
  }, [search])

  // follow the page: re-run when it changes, keeping the place
  useEffect(() => {
    if (!open || !query) return
    const root = document.getElementById('root')
    if (!root) return
    let t: number | undefined
    const mo = new MutationObserver((records) => {
      if (records.every((r) => (r.target as Element).closest?.('[data-find-ignore]'))) return
      window.clearTimeout(t)
      t = window.setTimeout(() => search(true), 150)
    })
    // not 'style': find's own repaint nudge (find.ts) changes inline styles, and
    // watching them made find re-search and re-paint itself about 20 times a second
    mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] })
    return () => {
      mo.disconnect()
      window.clearTimeout(t)
    }
  }, [open, query, search])

  const step = useCallback((dir: 1 | -1) => {
    const n = ranges.current.length
    if (!n) return
    const i = (indexRef.current + dir + n) % n
    indexRef.current = i
    setIndex(i)
    paint(ranges.current, i)
    reveal(ranges.current[i])
  }, [])

  // bumped on every open, so ⌘F while open focuses the input again
  const [opened, setOpened] = useState(0)
  const show = useCallback(() => {
    setOpen(true)
    setOpened((n) => n + 1)
  }, [])
  // focus once the bar is on screen (this runs after the skin's bar commits)
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open, opened])

  const close = useCallback(() => {
    setOpen(false)
    ranges.current = []
    setCount(0)
    clearPaint()
  }, [])

  useEffect(() => {
    const offs = [onCommand('find', show), onCommand('findNext', () => (open ? step(1) : show())), onCommand('findPrev', () => (open ? step(-1) : show()))]
    return () => offs.forEach((off) => off())
  }, [show, step, open])

  useEffect(() => clearPaint, [])

  return { open, query, setQuery, count, index, next: () => step(1), prev: () => step(-1), show, close, inputRef }
}

export type FindState = ReturnType<typeof useFind>
