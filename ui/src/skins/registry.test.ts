import { describe, expect, it } from 'vitest'
import { DEFAULT_SKIN, type Skin, skinFor, SKINS } from './registry'

const fake = (name: string): Skin => ({ name, label: name, load: async () => ({ App: () => null }) })

describe('skinFor', () => {
  it('has the default skin registered', () => {
    expect(SKINS.some((s) => s.name === DEFAULT_SKIN)).toBe(true)
  })
  it('picks the named skin', () => {
    const list = [fake('terminal'), fake('mac')]
    expect(skinFor('mac', list).name).toBe('mac')
  })
  it('falls back to the default for unset or unknown names', () => {
    const list = [fake('terminal'), fake('native')]
    expect(skinFor(undefined, list).name).toBe('native')
    expect(skinFor('gone', list).name).toBe('native')
  })
  it('falls back to the first skin if the default is missing', () => {
    expect(skinFor('x', [fake('mac')]).name).toBe('mac')
  })
})
