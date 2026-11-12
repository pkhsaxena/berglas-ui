import { afterEach, expect, test } from 'vitest'
import type { Secret } from './api'
import { listKey, metaCache, versionsKey } from './cache'

afterEach(() => metaCache.clear())

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
