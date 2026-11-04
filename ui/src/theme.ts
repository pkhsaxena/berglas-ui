// Theme presets. Applying one sets the nine --t-* properties on <html>
// and data-mode; the choice is shared across tabs via the storage event.

type Tokens = {
  bg: string
  fg: string
  comment: string
  keyword: string
  string: string
  function: string
  number: string
  prompt: string
  error: string
}

export type Preset = { name: string; mode: 'dark' | 'light'; tokens: Tokens }

const t = (...v: string[]): Tokens => {
  const [bg, fg, comment, keyword, string, fn, number, prompt, error] = v
  return { bg, fg, comment, keyword, string, function: fn, number, prompt, error }
}

export const PRESETS: Preset[] = [
  { name: 'Dracula', mode: 'dark', tokens: t('#282a36', '#f8f8f2', '#8390b7', '#ff79c6', '#f1fa8c', '#50fa7b', '#bd93f9', '#8be9fd', '#ff5555') },
  { name: 'GitHub light', mode: 'light', tokens: t('#ffffff', '#24292f', '#6e7781', '#cf222e', '#0a3069', '#8250df', '#0550ae', '#116329', '#cf222e') },
  { name: 'Gruvbox', mode: 'dark', tokens: t('#282828', '#ebdbb2', '#9a8c7e', '#fb5440', '#b8bb26', '#fabd2f', '#d3869b', '#83a598', '#fb5440') },
  { name: 'Monokai', mode: 'dark', tokens: t('#272822', '#f8f8f2', '#928f80', '#fa4989', '#e6db74', '#a6e22e', '#ae81ff', '#66d9ef', '#fa4989') },
  { name: 'Nord', mode: 'dark', tokens: t('#2e3440', '#d8dee9', '#949cae', '#81a1c1', '#a3be8c', '#88c0d0', '#b690af', '#8fbcbb', '#cf888f') },
  { name: 'Solarized dark', mode: 'dark', tokens: t('#002b36', '#93a1a1', '#809196', '#859900', '#2aa198', '#3794d6', '#dd629e', '#b58900', '#e56563') },
  { name: 'Solarized light', mode: 'light', tokens: t('#fdf6e3', '#586e75', '#687272', '#687700', '#217e77', '#2076b2', '#c8337c', '#8f6c00', '#d5302e') },
]

const KEY = 'berglas-ui.theme'
const DEFAULT = 'Dracula'

export function storedTheme(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && PRESETS.some((p) => p.name === v)) return v
  } catch {
    // storage blocked: fall back to the default
  }
  return DEFAULT
}

export function applyTheme(name: string) {
  const p = PRESETS.find((x) => x.name === name) ?? PRESETS[0]
  const root = document.documentElement
  for (const [k, v] of Object.entries(p.tokens)) root.style.setProperty(`--t-${k}`, v)
  root.dataset.mode = p.mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.tokens.bg)
}

export function saveTheme(name: string) {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    // not persisted; still applied for this page
  }
  applyTheme(name)
}

export function onThemeChange(cb: (name: string) => void): () => void {
  const h = (e: StorageEvent) => {
    if (e.key === KEY) {
      const name = storedTheme()
      applyTheme(name)
      cb(name)
    }
  }
  window.addEventListener('storage', h)
  return () => window.removeEventListener('storage', h)
}
