import { type RefObject, useLayoutEffect, useRef } from 'react'

const MS = 240
const EASE = 'cubic-bezier(.4,0,.2,1)'

/**
 * Smooths a list whose rows move, appear or go when it re-renders (the recent
 * list puts the secret just opened at the top). Each child with a
 * `data-flip` key slides from where it was to where it is now ("FLIP"); a new
 * row fades in and, when the list got longer, grows from no height so what
 * sits below slides down instead of jumping. A row that leaves just goes; the
 * rest close the gap smoothly.
 *
 * Positions are offsetTop, which ignores transforms (so a row caught
 * mid-slide measures where it will land) and is in the same css px as the
 * ui zoom. With reduced motion asked for, nothing animates.
 */
export function useFlip(list: RefObject<HTMLElement | null>, keys: string) {
  const tops = useRef<Map<string, number> | null>(null)

  useLayoutEffect(() => {
    const el = list.current
    if (!el) {
      tops.current = null
      return
    }
    const rows = [...el.querySelectorAll<HTMLElement>(':scope > [data-flip]')]
    const now = new Map(rows.map((r) => [r.dataset.flip!, r.offsetTop]))
    const before = tops.current
    tops.current = now
    // the first render after mounting (or unfolding) just shows the list
    if (!before || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const grew = now.size > before.size
    const added = rows.filter((r) => !before.has(r.dataset.flip!))

    for (const r of added) {
      const h = r.offsetHeight
      // padding too, or a row at height 0 still takes its padding's room and the list jumps by that much
      const { paddingTop, paddingBottom, marginTop, marginBottom } = getComputedStyle(r)
      const frames: Keyframe[] = grew
        ? [
            { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', overflow: 'hidden' },
            { opacity: 1, height: `${h}px`, paddingTop, paddingBottom, marginTop, marginBottom, overflow: 'hidden' },
          ]
        : [{ opacity: 0 }, { opacity: 1 }]
      r.animate?.(frames, { duration: MS, easing: EASE })
    }
    for (const r of rows) {
      const was = before.get(r.dataset.flip!)
      if (was === undefined) continue
      // a growing new row above already carries this one down as it opens; don't slide it that far twice
      const pushedBy = grew ? added.filter((a) => a.offsetTop < r.offsetTop).reduce((n, a) => n + a.offsetHeight, 0) : 0
      const dy = was - r.offsetTop + pushedBy
      if (dy !== 0) r.animate?.([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: MS, easing: EASE })
    }
  }, [list, keys])
}
