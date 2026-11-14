import { expect, test } from 'vitest'
import { widthClass } from './useLayoutWidth'

test('bands', () => {
  const bp = { narrow: 820, wide: 2000 }
  expect(widthClass(760, bp)).toBe('narrow')
  expect(widthClass(819, bp)).toBe('narrow')
  expect(widthClass(820, bp)).toBe('normal')
  expect(widthClass(1999, bp)).toBe('normal')
  expect(widthClass(2000, bp)).toBe('wide')
  expect(widthClass(2149, bp)).toBe('wide') // a 1440px window at 67% zoom
})
