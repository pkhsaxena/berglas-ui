import { expect, test } from 'vitest'
import { matchesQuery } from './envfilter'

test('matches keys or values, any case; empty matches all', () => {
  expect(matchesQuery('DATABASE_URL', 'postgres://db', '')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', 'data')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', 'POSTGRES')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', '  db ')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'info', 'stripe')).toBe(false)
})
