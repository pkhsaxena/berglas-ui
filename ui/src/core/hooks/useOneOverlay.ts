import { useEffect, useRef } from 'react'

type Overlay = { open: boolean; close: () => void }

/**
 * Overlays that would cover each other (the ⌘K palette and the `?` shortcut
 * sheet): opening one closes the others, so the newest is the only one shown.
 */
export function useOneOverlay(...overlays: Overlay[]) {
  const latest = useRef(overlays)
  latest.current = overlays
  const opened = overlays.map((o) => o.open)
  const was = useRef(opened)
  useEffect(() => {
    const justOpened = opened.findIndex((o, i) => o && !was.current[i])
    was.current = opened
    if (justOpened < 0) return
    latest.current.forEach((o, i) => {
      if (i !== justOpened && o.open) o.close()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when any open flag flips
  }, opened)
}
