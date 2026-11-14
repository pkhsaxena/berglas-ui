// The native skin's themes. "System" follows the OS; Light and Dark pin one.
// The name is saved as `theme:` in the config like the terminal skin's;
// names this skin doesn't know fall back to System.

export const THEMES = ['System', 'Light', 'Dark'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'System'

export const knownTheme = (name: string | undefined): Theme => (THEMES as readonly string[]).includes(name ?? '') ? (name as Theme) : DEFAULT_THEME

export function applyTheme(name: Theme) {
  const root = document.documentElement
  if (name === 'System') delete root.dataset.theme
  else root.dataset.theme = name.toLowerCase()
}
