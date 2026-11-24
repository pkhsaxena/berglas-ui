import { describe, expect, it } from 'vitest'
import { modKey, shortcutGroups } from './shortcuts'

describe('shortcuts', () => {
  it('uses ⌘ on a Mac and Ctrl+ elsewhere', () => {
    expect(modKey('MacIntel')).toBe('⌘')
    expect(modKey('Win32')).toBe('Ctrl+')
  })
  it('lists the palette, settings, filter and this sheet, and marks menu-only keys', () => {
    const g = shortcutGroups('⌘')
    const keys = g.flatMap((x) => x.items.flatMap((i) => i.keys))
    for (const k of ['⌘K', '⌘,', '/', '?', 'Esc', '⌘L', '⌘B']) expect(keys).toContain(k)
    expect(g.find((x) => x.items.some((i) => i.keys.includes('⌘L')))?.desktopOnly).toBe(true)
  })
})
