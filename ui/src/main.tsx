import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/components.css'
import App from './App.tsx'
import { applyTheme, DEFAULT_THEME } from './theme'

applyTheme(DEFAULT_THEME)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
