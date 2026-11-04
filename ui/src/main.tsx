import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/components.css'
import App from './App.tsx'
import { applyTheme, storedTheme } from './theme'

applyTheme(storedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
