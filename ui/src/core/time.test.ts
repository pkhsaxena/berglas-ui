import { afterEach, expect, test, vi } from 'vitest'
import { stamp } from './time'

afterEach(() => vi.unstubAllEnvs())

test('utc stamps ignore the system zone', () => {
  expect(stamp('2026-05-08T11:53:30Z', 'utc')).toBe('2026-05-08 11:53 utc')
})

test('local stamps use the system zone and name it', () => {
  vi.stubEnv('TZ', 'Asia/Kolkata') // pin the zone so the expectation is stable
  expect(stamp('2026-05-08T11:53:30Z', 'local')).toMatch(/^2026-05-08 17:23 (ist|gmt\+5:30)$/)
})

test('bad input', () => {
  expect(stamp('nope', 'local')).toBe('unknown')
})
