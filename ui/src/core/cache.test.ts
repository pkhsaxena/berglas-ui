import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Secret } from './api'
import { configureCache, DEFAULT_MAX_ENTRIES as MAX_ENTRIES, DEFAULT_TTL_MS as TTL_MS, listKey, metaCache, versionsKey } from './cache'

const SWEEP_MS = 60_000

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  configureCache(TTL_MS / 1000, MAX_ENTRIES)
  metaCache.clear()
  vi.useRealTimers()
})

const s = (name: string) => ({ name }) as Secret

test('lists are kept per source and versions per secret', () => {
  metaCache.set(listKey({ backend: 'storage', parent: 'b1' }), [s('a')])
  metaCache.set(versionsKey({ backend: 'storage', parent: 'b1', name: 'a' }), [s('a')])
  expect(metaCache.get(listKey({ backend: 'storage', parent: 'b1' }))).toHaveLength(1)
  expect(metaCache.get(listKey({ backend: 'sm', parent: 'b1' }))).toBeUndefined()
  expect(metaCache.get(versionsKey({ backend: 'storage', parent: 'b2', name: 'a' }))).toBeUndefined()
})

test('a deleted secret drops its versions', () => {
  const k = versionsKey({ backend: 'sm', parent: 'p', name: 'a' })
  metaCache.set(k, [s('a')])
  metaCache.delete(k)
  expect(metaCache.get(k)).toBeUndefined()
})

test('entries expire after the ttl', () => {
  metaCache.set('k', [s('a')])
  vi.advanceTimersByTime(TTL_MS - 1000)
  expect(metaCache.get('k')).toHaveLength(1)
  vi.advanceTimersByTime(2000)
  expect(metaCache.get('k')).toBeUndefined()
})

test('a fresh copy restarts the ttl', () => {
  metaCache.set('k', [s('a')])
  vi.advanceTimersByTime(TTL_MS - 1000)
  metaCache.set('k', [s('b')])
  vi.advanceTimersByTime(TTL_MS - 1000)
  expect(metaCache.get('k')?.[0].name).toBe('b')
})

test('the sweep frees expired entries nobody asks for again', () => {
  for (let i = 0; i < 20; i++) metaCache.set(`k${i}`, [s('a')])
  expect(metaCache.size()).toBe(20)
  vi.advanceTimersByTime(TTL_MS + SWEEP_MS)
  expect(metaCache.size()).toBe(0)
  expect(vi.getTimerCount()).toBe(0) // the sweep stops once the cache is empty
})

test('holds at most MAX_ENTRIES, dropping the least recently used', () => {
  for (let i = 0; i < MAX_ENTRIES; i++) metaCache.set(`k${i}`, [s('a')])
  metaCache.get('k0') // used recently, so it stays
  metaCache.set('new', [s('a')])
  expect(metaCache.size()).toBe(MAX_ENTRIES)
  expect(metaCache.get('k0')).toBeDefined()
  expect(metaCache.get('k1')).toBeUndefined()
  expect(metaCache.get('new')).toBeDefined()
})

test('cacheSeconds or cacheEntries at 0 turns the cache off and empties it', () => {
  metaCache.set('k', [s('a')])
  configureCache(0, 500)
  expect(metaCache.size()).toBe(0)
  metaCache.set('k', [s('a')])
  expect(metaCache.get('k')).toBeUndefined()
  configureCache(600, 0)
  metaCache.set('k', [s('a')])
  expect(metaCache.size()).toBe(0)
})

test('a smaller cacheEntries trims at once, oldest first', () => {
  for (let i = 0; i < 10; i++) metaCache.set(`k${i}`, [s('a')])
  configureCache(600, 3)
  expect(metaCache.size()).toBe(3)
  expect(metaCache.get('k9')).toBeDefined()
  expect(metaCache.get('k0')).toBeUndefined()
})

test('a short ttl expires and is swept on its own schedule', () => {
  configureCache(5, 500)
  metaCache.set('k', [s('a')])
  vi.advanceTimersByTime(4000)
  expect(metaCache.get('k')).toBeDefined()
  vi.advanceTimersByTime(2000)
  expect(metaCache.get('k')).toBeUndefined()
  metaCache.set('j', [s('a')])
  vi.advanceTimersByTime(11_000) // well under the usual one-minute sweep
  expect(metaCache.size()).toBe(0)
})
