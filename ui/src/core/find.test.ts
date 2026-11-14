import { expect, test } from 'vitest'
import { findOffsets } from './find'

test('finds every occurrence, any case, without overlaps', () => {
  expect(findOffsets('DATABASE_URL=postgres://db', 'data')).toEqual([0])
  expect(findOffsets('aaaa', 'aa')).toEqual([0, 2])
  expect(findOffsets('Log level LOG', 'log')).toEqual([0, 10])
  expect(findOffsets('anything', '')).toEqual([])
  expect(findOffsets('abc', 'x')).toEqual([])
})
