import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The skin decides how berglas-ui looks. To change the ui, add a folder under
// skins/ that builds on core/hooks and point this import at it.
import { App } from './skins/terminal'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
