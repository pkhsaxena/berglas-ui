import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { copySecret } from './clipboard'

let board = ''
let readable = true

beforeEach(() => {
  vi.useFakeTimers()
  board = ''
  readable = true
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: async (t: string) => void (board = t),
      readText: async () => {
        if (!readable) throw new Error('denied')
        return board
      },
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('clears the copied value after the delay', async () => {
  const notes: string[] = []
  await copySecret('s3cret', 30, (m) => notes.push(m))
  expect(board).toBe('s3cret')
  await vi.advanceTimersByTimeAsync(30_000)
  expect(board).toBe('')
  expect(notes).toEqual(['clipboard cleared'])
})

test('leaves the clipboard alone when the user copied something else', async () => {
  const notes: string[] = []
  await copySecret('s3cret', 30, (m) => notes.push(m))
  board = 'something the user copied later'
  await vi.advanceTimersByTimeAsync(30_000)
  expect(board).toBe('something the user copied later')
  expect(notes).toEqual([])
})

test('says so when it cannot read the clipboard, and does not clear', async () => {
  const notes: string[] = []
  readable = false
  await copySecret('s3cret', 30, (m) => notes.push(m))
  await vi.advanceTimersByTimeAsync(30_000)
  expect(board).toBe('s3cret')
  expect(notes[0]).toMatch(/still there/)
})

test('0 never clears; a newer copy replaces the pending clear', async () => {
  await copySecret('a', 0, () => {})
  await vi.advanceTimersByTimeAsync(600_000)
  expect(board).toBe('a')
  await copySecret('b', 30, () => {})
  await vi.advanceTimersByTimeAsync(10_000)
  await copySecret('c', 30, () => {})
  await vi.advanceTimersByTimeAsync(25_000) // first timer would have fired here
  expect(board).toBe('c')
  await vi.advanceTimersByTimeAsync(5_000)
  expect(board).toBe('')
})

test('uses a swapped-in backend, e.g. the desktop app', async () => {
  const calls: string[] = []
  const { setClipboardBackend } = await import('./clipboard')
  setClipboardBackend({
    write: async (t) => void calls.push(`write ${t}`),
    clearIf: async (t) => (calls.push(`clearIf ${t}`), true),
  })
  try {
    const notes: string[] = []
    await copySecret('s3cret', 30, (m) => notes.push(m))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toEqual(['write s3cret', 'clearIf s3cret'])
    expect(board).toBe('') // the browser clipboard was never touched
    expect(notes).toEqual(['clipboard cleared'])
  } finally {
    setClipboardBackend(null)
  }
})
