// The desktop app (Wails) runs this same ui in a native web view. The core
// answers GET /api/desktop there, and only there. A web view only lets a page
// use the clipboard inside a click, and a link would replace the app, so in
// the app both go through the core instead.
import { setClipboardBackend } from './clipboard'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as T
}

/** True when the ui runs inside the desktop app. */
export async function isDesktop(): Promise<boolean> {
  try {
    return (await fetch('/api/desktop')).ok
  } catch {
    return false
  }
}

/** Whether a link should leave the app for the user's browser or mail app. */
export function isExternal(href: string, origin: string): boolean {
  try {
    const u = new URL(href, origin)
    return u.protocol === 'mailto:' || ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== origin)
  } catch {
    return false
  }
}

function openExternalLinks(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || !isExternal(a.href, window.location.origin)) return
  e.preventDefault()
  void post('/api/desktop/open', { url: a.href }).catch(() => {})
}

let desktopMode = false

/** True once enableDesktop ran: the ui is inside the desktop app. */
export const inDesktop = () => desktopMode

/** Routes the clipboard and outside links through the core. */
export function enableDesktop() {
  desktopMode = true
  setClipboardBackend({
    write: async (text) => void (await post('/api/desktop/clipboard', { text })),
    clearIf: async (text) => (await post<{ cleared: boolean }>('/api/desktop/clipboard/clear', { ifEquals: text })).cleared,
  })
  document.addEventListener('click', openExternalLinks, true)
}
