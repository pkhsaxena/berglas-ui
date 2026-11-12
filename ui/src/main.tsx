import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from './core/api'
import { skinFor } from './skins/registry'

// The skin decides how berglas-ui looks. The config's `skin:` picks one of
// those in skins/registry.ts; to add a design, add a folder under skins/ that
// builds on core/hooks and register it there.
async function start() {
  let name: string | undefined
  try {
    name = (await api.config()).skin
  } catch {
    // not paired or core down: the default skin shows why
  }
  const { App } = await skinFor(name).load()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
