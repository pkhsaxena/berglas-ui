import { expect, test } from 'vitest'
import { findOffsets, spanMatches } from './find'

test('finds every occurrence, any case, without overlaps', () => {
  expect(findOffsets('DATABASE_URL=postgres://db', 'data')).toEqual([0])
  expect(findOffsets('aaaa', 'aa')).toEqual([0, 2])
  expect(findOffsets('Log level LOG', 'log')).toEqual([0, 10])
  expect(findOffsets('anything', '')).toEqual([])
  expect(findOffsets('abc', 'x')).toEqual([])
})

test('matches across pieces of text read as one string', () => {
  // "APP_" <wbr> "ENV": KeyText splits keys after "_"
  expect(spanMatches(['APP_', 'ENV'], 'app_env')).toEqual([{ start: [0, 0], end: [1, 3] }])
  expect(spanMatches(['APP_', 'ENV'], 'app_')).toEqual([{ start: [0, 0], end: [0, 4] }])
  expect(spanMatches(['APP_', 'ENV'], 'env')).toEqual([{ start: [1, 0], end: [1, 3] }])
  expect(spanMatches(['ACME_', 'ORDER_', 'API_', 'KEY'], 'order_api')).toEqual([{ start: [1, 0], end: [2, 3] }])
  expect(spanMatches(['a', 'b'], 'x')).toEqual([])
})
