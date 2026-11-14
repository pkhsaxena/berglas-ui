// The skins this build has. A skin is a folder under skins/ whose index
// exports App and builds only on ../core. Each one is its own chunk, loaded
// on demand, so only the chosen skin's code and styles reach the page.
import type { ComponentType } from 'react'

export type Skin = {
  /** stored as `skin:` in the config file */
  name: string
  /** shown in skin pickers */
  label: string
  load: () => Promise<{ App: ComponentType }>
}

export const DEFAULT_SKIN = 'terminal'

export const SKINS: Skin[] = [
  { name: 'terminal', label: 'terminal', load: () => import('./terminal') },
  { name: 'native', label: 'native', load: () => import('./native') },
]

/** The skin named in the config, or the default one for unset or unknown names. */
export function skinFor(name: string | undefined, skins: Skin[] = SKINS): Skin {
  return skins.find((s) => s.name === name) ?? skins.find((s) => s.name === DEFAULT_SKIN) ?? skins[0]
}
