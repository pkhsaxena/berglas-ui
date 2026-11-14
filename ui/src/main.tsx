import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from './core/api'
import { enableDesktop, isDesktop } from './core/desktop'
import { disableTextAssist } from './core/textassist'
import { skinFor } from './skins/registry'

// The skin decides how berglas-ui looks. The config's `skin:` picks one of
// those in skins/registry.ts; to add a design, add a folder under skins/ that
// builds on core/hooks and register it there.
async function start() {
  disableTextAssist()
  const [config, desktop] = await Promise.all([api.config().catch(() => null), isDesktop()])
  // config is null when not paired or the core is down: the default skin shows why
  const name = config?.skin
  if (desktop) enableDesktop()
  const { App } = await skinFor(name).load()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
