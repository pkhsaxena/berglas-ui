// The native skin's themes. "System" follows the OS; Light and Dark pin one;
// the Catppuccin flavours are styles/native.css's ctp-* palettes.
// The name is saved as `theme:` in the config like the terminal skin's;
// names this skin doesn't know fall back to System.

export const THEMES = ['System', 'Light', 'Dark', 'Catppuccin Latte', 'Catppuccin Frappé', 'Catppuccin Macchiato', 'Catppuccin Mocha'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'System'

export const knownTheme = (name: string | undefined): Theme => (THEMES as readonly string[]).includes(name ?? '') ? (name as Theme) : DEFAULT_THEME

export function applyTheme(name: Theme) {
  const root = document.documentElement
  if (name === 'System') delete root.dataset.theme
  else root.dataset.theme = name.startsWith('Catppuccin ') ? `ctp-${name.slice(11).toLowerCase().replace('é', 'e')}` : name.toLowerCase()
}
