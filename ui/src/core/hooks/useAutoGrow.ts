import { useEffect, useLayoutEffect, useRef } from 'react'

// as tall as its wrapped text: the scroll height plus the borders (the field is border-box)
function fit(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

/**
 * A textarea that grows with its text instead of cutting it off, for the
 * editor's values: a long value wraps onto more lines and the field gets
 * taller, up to the skin's max-height (3 lines), past which the value
 * scrolls inside the field. It fits again when the value changes and when
 * the field's width does (a resized window, a zoom, the side bar hidden).
 */
export function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (ref.current) fit(ref.current)
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return // only a width change can rewrap the text
      width = el.clientWidth
      fit(el)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return ref
}
