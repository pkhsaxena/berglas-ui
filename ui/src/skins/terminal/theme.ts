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

/** bannerMix: how much of the error colour the production banner keeps (the rest is black); lower for pastel reds so white text stays at 4.5:1 */
export type Preset = { name: string; mode: 'dark' | 'light'; tokens: Tokens; bannerMix?: number }

const t = (...v: string[]): Tokens => {
  const [bg, fg, comment, keyword, string, fn, number, prompt, error] = v
  return { bg, fg, comment, keyword, string, function: fn, number, prompt, error }
}

export const PRESETS: Preset[] = [
  // Catppuccin (catppuccin.com, MIT): string = yellow and function = green, so
  // staging and dev keep their usual tones; Latte's accents are darkened to
  // 4.5:1 on its background
  { name: 'Catppuccin Latte', mode: 'light', tokens: t('#eff1f5', '#4c4f69', '#6a6d82', '#8839ef', '#986114', '#327d22', '#c63b47', '#1d62eb', '#d20f39') },
  { name: 'Catppuccin Frappé', mode: 'dark', tokens: t('#303446', '#c6d0f5', '#949cbb', '#ca9ee6', '#e5c890', '#a6d189', '#ef9f76', '#85c1dc', '#e78284'), bannerMix: 55 },
  { name: 'Catppuccin Macchiato', mode: 'dark', tokens: t('#24273a', '#cad3f5', '#939ab7', '#c6a0f6', '#eed49f', '#a6da95', '#f5a97f', '#7dc4e4', '#ed8796'), bannerMix: 55 },
  { name: 'Catppuccin Mocha', mode: 'dark', tokens: t('#1e1e2e', '#cdd6f4', '#9399b2', '#cba6f7', '#f9e2af', '#a6e3a1', '#fab387', '#74c7ec', '#f38ba8'), bannerMix: 55 },
  { name: 'Dracula', mode: 'dark', tokens: t('#282a36', '#f8f8f2', '#8390b7', '#ff79c6', '#f1fa8c', '#50fa7b', '#bd93f9', '#8be9fd', '#ff5555') },
  { name: 'GitHub light', mode: 'light', tokens: t('#ffffff', '#24292f', '#6e7781', '#cf222e', '#0a3069', '#8250df', '#0550ae', '#116329', '#cf222e') },
  { name: 'Gruvbox', mode: 'dark', tokens: t('#282828', '#ebdbb2', '#9a8c7e', '#fb5440', '#b8bb26', '#fabd2f', '#d3869b', '#83a598', '#fb5440') },
  { name: 'Monokai', mode: 'dark', tokens: t('#272822', '#f8f8f2', '#928f80', '#fa4989', '#e6db74', '#a6e22e', '#ae81ff', '#66d9ef', '#fa4989') },
  { name: 'Nord', mode: 'dark', tokens: t('#2e3440', '#d8dee9', '#949cae', '#81a1c1', '#a3be8c', '#88c0d0', '#b690af', '#8fbcbb', '#cf888f') },
  { name: 'Solarized dark', mode: 'dark', tokens: t('#002b36', '#93a1a1', '#809196', '#859900', '#2aa198', '#3794d6', '#dd629e', '#b58900', '#e56563') },
  { name: 'Solarized light', mode: 'light', tokens: t('#fdf6e3', '#586e75', '#687272', '#687700', '#217e77', '#2076b2', '#c8337c', '#8f6c00', '#d5302e') },
]

// The chosen theme is saved in the core's config file, not localStorage: the
// core's random port gives the page a new origin, and so new storage, on
// every launch.
export const DEFAULT_THEME = 'Dracula'

/** Returns a known preset name, falling back to the default. */
export const knownTheme = (name: string | undefined) => (PRESETS.some((p) => p.name === name) ? name! : DEFAULT_THEME)

export function applyTheme(name: string) {
  const p = PRESETS.find((x) => x.name === name) ?? PRESETS[0]
  const root = document.documentElement
  for (const [k, v] of Object.entries(p.tokens)) root.style.setProperty(`--t-${k}`, v)
  root.dataset.mode = p.mode
  root.style.setProperty('--t-banner-mix', `${p.bannerMix ?? 78}%`)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.tokens.bg)
}
