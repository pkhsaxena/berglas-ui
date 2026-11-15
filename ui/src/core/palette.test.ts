import { describe, expect, it, vi } from 'vitest'
import { metaCache, listKey } from './cache'
import { fuzzyScore, type PaletteItem, paletteActions, paletteItems, rankItems } from './palette'

const item = (label: string, group: PaletteItem['group'] = 'Secrets', hint?: string): PaletteItem => ({ id: label, group, label, hint, run: () => {} })

describe('fuzzyScore', () => {
  it('needs every character in order', () => {
    expect(fuzzyScore('pde', 'payments-dev-env')).not.toBeNull()
    expect(fuzzyScore('zz', 'payments-dev-env')).toBeNull()
  })
  it('prefers substrings, then word starts', () => {
    expect(fuzzyScore('dev', 'payments-dev-env')!).toBeGreaterThan(fuzzyScore('pde', 'payments-dev-env')!)
    expect(fuzzyScore('pde', 'payments-dev-env')!).toBeGreaterThan(fuzzyScore('pde', 'xpxdxe')!)
  })
})

describe('rankItems', () => {
  const items = [item('orders-prod-env'), item('payments-prod-env'), item('Zoom in', 'Actions'), item('Open source demo', 'Sources', 'storage bucket')]
  it('lists everything for an empty query', () => {
    expect(rankItems(items, '').map((i) => i.label)).toEqual(items.map((i) => i.label))
  })
  it('ranks the best match first and drops non-matches', () => {
    expect(rankItems(items, 'pay').map((i) => i.label)).toEqual(['payments-prod-env'])
    expect(rankItems(items, 'prod')[0].label).toBe('orders-prod-env')
  })
  it('matches hints at lower weight', () => {
    expect(rankItems(items, 'bucket').map((i) => i.label)).toEqual(['Open source demo'])
  })
})

describe('paletteItems', () => {
  it('lists the open source, cached other sources, sources and actions', () => {
    const a = { backend: 'storage' as const, parent: 'a' }
    const b = { backend: 'sm' as const, parent: 'b' }
    const c = { backend: 'sm' as const, parent: 'c' }
    metaCache.set(listKey(b), [{ backend: 'sm', parent: 'b', name: 'in-b', updatedAt: '' }])
    const open = vi.fn()
    const items = paletteItems({
      sources: [a, b, c],
      active: a,
      secrets: [{ backend: 'storage', parent: 'a', name: 'in-a', updatedAt: '' }],
      openSecret: open,
      setActive: () => {},
      actions: [{ label: 'Refresh', run: () => {} }],
    })
    expect(items.map((i) => `${i.group}:${i.label}`)).toEqual(['Secrets:in-a', 'Secrets:in-b', 'Sources:Open source a', 'Sources:Open source b', 'Sources:Open source c', 'Actions:Refresh'])
    items[1].run()
    expect(open).toHaveBeenCalledWith(b, 'in-b')
  })
})

describe('paletteActions', () => {
  const base = {
    views: [],
    showView: () => {},
    driftServices: [],
    openDrift: () => {},
    zoom: () => {},
    themes: ['System', 'Light', 'Dark'],
    setTheme: () => {},
    skins: [
      { name: 'terminal', label: 'Terminal' },
      { name: 'native', label: 'Native' },
    ],
    setSkin: () => {},
    setTimeZone: () => {},
  }
  it('leaves out the current time zone, theme and skin', () => {
    const labels = paletteActions({ ...base, timeZone: 'local', theme: 'Light', skin: 'native' }).map((a) => a.label)
    expect(labels).toContain('Time: UTC')
    expect(labels).not.toContain('Time: local')
    expect(labels.filter((l) => l.startsWith('Theme:'))).toEqual(['Theme: System', 'Theme: Dark'])
    expect(labels.filter((l) => l.startsWith('Skin:'))).toEqual(['Skin: Terminal'])
    expect(paletteActions({ ...base, timeZone: 'utc' }).map((a) => a.label)).toContain('Time: local')
  })
})

describe('paletteItems favourites and recents', () => {
  it('lists them first, once each, and only for known sources', () => {
    const a = { backend: 'storage' as const, parent: 'a' }
    const items = paletteItems({
      sources: [a],
      active: a,
      secrets: [
        { backend: 'storage', parent: 'a', name: 'x', updatedAt: '' },
        { backend: 'storage', parent: 'a', name: 'y', updatedAt: '' },
      ],
      favorites: [{ ...a, name: 'y' }, { backend: 'sm', parent: 'gone', name: 'z' }],
      recent: [{ ...a, name: 'y' }, { ...a, name: 'x' }],
      openSecret: () => {},
      setActive: () => {},
      actions: [],
    })
    expect(items.filter((i) => i.group !== 'Sources').map((i) => `${i.group}:${i.label}`)).toEqual(['Favourites:y', 'Recent:x'])
  })
})
