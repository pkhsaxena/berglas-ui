// The terminal skin: the terminal-pane look. A skin is only markup,
// styles and theme presets; all behaviour comes from ../../core.
import './styles/tokens.css'
import './styles/components.css'
import { applyTheme, DEFAULT_THEME } from './theme'

applyTheme(DEFAULT_THEME)

export { default as App } from './App'
