import { useEffect } from 'react'

export type WidthClass = 'narrow' | 'normal' | 'wide'

/** Which band a width falls in, for breakpoints in css px. */
export function widthClass(width: number, bp: { narrow: number; wide: number }): WidthClass {
  return width < bp.narrow ? 'narrow' : width >= bp.wide ? 'wide' : 'normal'
}

/**
 * Marks #root with data-width="narrow|normal|wide" from its own width, so a
 * skin's css can switch layouts on it. This stands in for media and
 * container queries because of the ui zoom (core/zoom.ts): with css zoom,
 * media queries never move, and WebKit (the mac app, Safari) still evaluates
 * container queries against the unzoomed width. #root's offsetWidth is right
 * in every engine.
 */
export function useLayoutWidth(bp: { narrow: number; wide: number }, zoom: number) {
  const { narrow, wide } = bp
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const apply = () => {
      root.dataset.width = widthClass(root.offsetWidth, { narrow, wide })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(root)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [narrow, wide, zoom])
}
