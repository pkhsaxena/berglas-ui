import { expect, test } from 'vitest'
import { stepZoom, ZOOM_STEPS } from './zoom'

test('steps through the zoom levels and stops at the ends', () => {
  expect(stepZoom(100, -1)).toBe(90)
  expect(stepZoom(100, 1)).toBe(110)
  expect(stepZoom(67, -1)).toBe(60)
  expect(stepZoom(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0])
  expect(stepZoom(200, 1)).toBe(200)
  expect(stepZoom(85, -1)).toBe(80) // a hand-edited value snaps to the next step
  expect(stepZoom(85, 1)).toBe(90)
})
