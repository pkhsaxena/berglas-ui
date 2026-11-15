import { describe, expect, it } from 'vitest'
import { hasRef, pushRecent, toggleRef } from './refs'

const a = { backend: 'storage' as const, parent: 'b', name: 'a' }
const c = { backend: 'sm' as const, parent: 'p', name: 'c' }

describe('refs', () => {
  it('toggles membership', () => {
    const once = toggleRef([], a)
    expect(hasRef(once, a)).toBe(true)
    expect(toggleRef(once, { ...a, version: '3' } as never)).toEqual([])
  })
  it('keeps recents newest first, unique and capped', () => {
    expect(pushRecent([a, c], c)).toEqual([c, a])
    expect(pushRecent([a], c, 1)).toEqual([c])
  })
})
