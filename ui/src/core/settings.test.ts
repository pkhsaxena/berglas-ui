import { expect, test } from 'vitest'
import { DEFAULT_SETTINGS, globToRegExp, kmsKeyFor, protectedFor, readOnlyFor, type Settings } from './settings'

const s: Settings = {
  ...DEFAULT_SETTINGS,
  protect: ['*-prod-*'],
  sources: [
    { backend: 'storage', parent: 'b1', kmsKey: 'k1', protect: ['root-?'] },
    { backend: 'sm', parent: 'p1', readOnly: true },
  ],
}

test('glob matches like path.Match', () => {
  expect(globToRegExp('*-prod-*').test('svc-prod-env')).toBe(true)
  expect(globToRegExp('*-prod-*').test('svc-dev-env')).toBe(false)
  expect(globToRegExp('a.b').test('axb')).toBe(false)
  expect(globToRegExp('[!x]y').test('zy')).toBe(true)
  expect(globToRegExp('*').test('a/b')).toBe(false)
})

test('policy helpers', () => {
  expect(protectedFor(s, { backend: 'storage', parent: 'b1', name: 'root-1' })).toBe(true)
  expect(protectedFor(s, { backend: 'storage', parent: 'b2', name: 'root-1' })).toBe(false)
  expect(protectedFor(s, { backend: 'sm', parent: 'x', name: 'a-prod-b' })).toBe(true)
  expect(readOnlyFor(s, { backend: 'sm', parent: 'p1' })).toBe(true)
  expect(readOnlyFor(s, { backend: 'storage', parent: 'b1' })).toBe(false)
  expect(readOnlyFor({ ...s, readOnly: true }, { backend: 'storage', parent: 'b1' })).toBe(true)
  expect(kmsKeyFor(s, { backend: 'storage', parent: 'b1' })).toBe('k1')
})
