import { expect, test } from 'vitest'
import { matchesQuery } from './envfilter'

test('matches keys or values, any case; empty matches all', () => {
  expect(matchesQuery('DATABASE_URL', 'postgres://db', '')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', 'data')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', 'POSTGRES')).toBe(true)
  expect(matchesQuery('DATABASE_URL', 'postgres://db', '  db ')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'info', 'stripe')).toBe(false)
})

test('matches the whole KEY=value line, so a copied line finds itself', () => {
  expect(matchesQuery('LOG_LEVEL', 'warn', 'LOG_LEVEL=warn')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'warn', 'level=wa')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'warn', 'LOG_LEVEL=info')).toBe(false)
})

test('matches when every word is in the key or the value', () => {
  expect(matchesQuery('LOG_LEVEL', 'warn', 'log warn')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'warn', 'WARN   log')).toBe(true)
  expect(matchesQuery('LOG_LEVEL', 'warn', 'log info')).toBe(false)
  expect(matchesQuery('DATABASE_URL', 'postgres://db prod', 'db prod')).toBe(true)
})
