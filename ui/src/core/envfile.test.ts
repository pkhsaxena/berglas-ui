import { describe, expect, it, test } from 'vitest'
import { insertKeyAfter, looksLikeEnv, parseEnv, removeKey, removeLine, renameLine, setKey, setLineValue } from './envfile'

const text = '# header\nexport A = 1\nB=2\r\n\nC=three\n'

test('setLineValue keeps prefix, comments and line endings', () => {
  expect(setLineValue(text, 1, '10')).toBe('# header\nexport A = 10\nB=2\r\n\nC=three\n')
  expect(setLineValue(text, 2, '20')).toBe('# header\nexport A = 1\nB=20\r\n\nC=three\n')
})

test('setLineValue refuses non-pair lines and multi-line values', () => {
  expect(() => setLineValue(text, 0, 'x')).toThrow()
  expect(() => setLineValue(text, 1, 'a\nb')).toThrow()
})

test('setKey rewrites an existing key or appends a new one', () => {
  expect(setKey(text, 'C', '3')).toBe('# header\nexport A = 1\nB=2\r\n\nC=3\n')
  expect(setKey(text, 'D', '4')).toBe(text + 'D=4\n')
  expect(setKey('A=1', 'B', '2')).toBe('A=1\nB=2\n')
  expect(setKey('', 'A', '1')).toBe('A=1\n')
  expect(() => setKey(text, 'bad key', '1')).toThrow()
})

test('removeKey and removeLine', () => {
  expect(removeKey('A=1\nB=2\nA=3\n', 'A')).toBe('B=2\n')
  expect(removeLine(text, 0)).toBe('export A = 1\nB=2\r\n\nC=three\n')
})

test('parseEnv strips CR from raw and exposes prefix', () => {
  const l = parseEnv('B=2\r\n')[0]
  expect(l).toEqual({ kind: 'pair', key: 'B', value: '2', prefix: 'B=', raw: 'B=2' })
  expect(looksLikeEnv(text)).toBe(true)
  expect(looksLikeEnv('-----BEGIN CERTIFICATE-----\nabc\n')).toBe(false)
})

test('insertKeyAfter puts a key inside a section and keeps that line ending', () => {
  const t = '# Server\nPORT=1\nTIMEOUT=2\n\n# DB\nURL=x\n'
  expect(insertKeyAfter(t, 2, 'HOST', 'h')).toBe('# Server\nPORT=1\nTIMEOUT=2\nHOST=h\n\n# DB\nURL=x\n')
  expect(insertKeyAfter('A=1\r\nB=2\r\n', 0, 'C', '3')).toBe('A=1\r\nC=3\r\nB=2\r\n')
  expect(insertKeyAfter('A=1', 0, 'B', '2')).toBe('A=1\nB=2')
  expect(() => insertKeyAfter(t, 99, 'X', '1')).toThrow()
})

describe('renameLine', () => {
  it('renames only the key, keeping indentation, export, spacing, value and the line ending', () => {
    const text = 'A=1\r\n  export OLD_KEY = "x y"\r\n# c\r\n'
    expect(renameLine(text, 1, 'NEW_KEY')).toBe('A=1\r\n  export NEW_KEY = "x y"\r\n# c\r\n')
  })
  it('leaves every other line alone, including another line with the same key', () => {
    expect(renameLine('K=1\nK=2\n', 0, 'J')).toBe('J=1\nK=2\n')
  })
  it('refuses invalid names and lines that are not pairs', () => {
    expect(() => renameLine('A=1\n', 0, '1BAD')).toThrow()
    expect(() => renameLine('A=1\n', 0, 'has space')).toThrow()
    expect(() => renameLine('# comment\n', 0, 'B')).toThrow()
  })
  it('keeps a key named export', () => {
    expect(renameLine('export=1\n', 0, 'X')).toBe('X=1\n')
  })
})
