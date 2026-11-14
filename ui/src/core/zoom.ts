// The ui zoom: css zoom on <html>. The skin's width breakpoints are container
// queries on the app root, so zooming out gives the layout more room the way
// browser zoom does (the desktop app's web view has no browser zoom).
// Saved as `zoom:` (percent) in the config.

export const ZOOM_STEPS = [50, 60, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]

export function applyZoom(percent: number) {
  document.documentElement.style.zoom = percent === 100 ? '' : String(percent / 100)
}

/** The next step in a direction from any percent; stays put at the ends. */
export function stepZoom(percent: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > percent) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  return [...ZOOM_STEPS].reverse().find((s) => s < percent) ?? ZOOM_STEPS[0]
}
