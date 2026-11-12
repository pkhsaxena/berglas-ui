import { expect, test } from 'vitest'
import { isExternal } from './desktop'

const app = 'wails://wails'

test('mail and other sites leave the app; its own pages stay', () => {
  expect(isExternal('mailto:a@example.com', app)).toBe(true)
  expect(isExternal('https://github.com/x', app)).toBe(true)
  expect(isExternal('/some/route', app)).toBe(false)
  expect(isExternal('wails://wails/x', app)).toBe(false)
  expect(isExternal('javascript:alert(1)', app)).toBe(false)
  expect(isExternal('file:///etc/passwd', app)).toBe(false)
})
