import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_MIN_MS, onRefresh, requestRefresh, resetRefresh } from './refresh'

afterEach(() => resetRefresh())

describe('refresh', () => {
  it('runs every listener, and stops one when asked', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = onRefresh(a)
    const stopB = onRefresh(b)
    requestRefresh(false, 100_000)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    stopA()
    requestRefresh(true, 100_001)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    stopB()
  })

  it('throttles coming back, but not a forced refresh', () => {
    const f = vi.fn()
    const stop = onRefresh(f)
    requestRefresh(false, 100_000)
    requestRefresh(false, 100_000 + REFRESH_MIN_MS - 1)
    expect(f).toHaveBeenCalledTimes(1)
    requestRefresh(true, 100_000 + REFRESH_MIN_MS - 1)
    expect(f).toHaveBeenCalledTimes(2)
    requestRefresh(false, 100_000 + 2 * REFRESH_MIN_MS)
    expect(f).toHaveBeenCalledTimes(3)
    stop()
  })
})
