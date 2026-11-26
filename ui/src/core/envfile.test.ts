import { describe, expect, it, test } from 'vitest'
import { insertKeyAfter, looksLikeEnv, parseEnv, pastedPairs, removeKey, removeLine, renameLine, setKey, setLineValue } from './envfile'

const text = '# header\nexport A = 1\nB=2\r\n\nC=three\n'

test('setLineValue keeps prefix, comments and line endings', () => {
  expect(setLineValue(text, 1, '10')).toBe('# header\nexport A = 10\nB=2\r\n\nC=three\n')
  expect(setLineValue(text, 2, '20')).toBe('# header\nexport A = 1\nB=20\r\n\nC=three\n')
})

test('setLineValue refuses non-pair lines and quotes a value with line breaks', () => {
  expect(() => setLineValue(text, 0, 'x')).toThrow()
  expect(setLineValue(text, 1, 'a\nb')).toBe('# header\nexport A = "a\nb"\nB=2\r\n\nC=three\n')
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
  expect(l).toEqual({ kind: 'pair', key: 'B', value: '2', prefix: 'B=', raw: 'B=2', line: 1 })
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

const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nAB==\n-----END PRIVATE KEY-----'

test('a quoted value spans lines up to its closing quote', () => {
  const t = `A=1\nKEY="${pem}"\nB=2\n`
  const lines = parseEnv(t)
  expect(lines.map((l) => (l.kind === 'pair' ? l.key : l.raw))).toEqual(['A', 'KEY', 'B', ''])
  expect(lines[1]).toMatchObject({ value: `"${pem}"`, line: 2 })
  expect(lines[2]).toMatchObject({ line: 6 })
  expect(looksLikeEnv(t)).toBe(true)
  // single quotes, and a comment after the closing quote
  expect(parseEnv("K='a\nb' # note\nX=1").map((l) => l.kind === 'pair' && l.key)).toEqual(['K', 'X'])
  // CRLF: the value reads with \n
  expect(parseEnv('K="a\r\nb"\r\nX=1\r\n')[0]).toMatchObject({ value: '"a\nb"', raw: 'K="a\r\nb"' })
})

test('an unclosed quote stops at the next key or the end, never swallowing them', () => {
  expect(parseEnv('A="open\nB="x"\nC=3').map((l) => l.kind === 'pair' && l.key)).toEqual(['A', 'B', 'C'])
  expect(parseEnv('A="open\nplain\n').map((l) => l.raw)).toEqual(['A="open', 'plain', ''])
})

test('edits keep a multi-line value whole', () => {
  const t = `A=1\nKEY="${pem}"\nB=2\n`
  expect(setLineValue(t, 2, '3')).toBe(`A=1\nKEY="${pem}"\nB=3\n`)
  expect(renameLine(t, 1, 'PEM')).toBe(`A=1\nPEM="${pem}"\nB=2\n`)
  expect(removeLine(t, 1)).toBe('A=1\nB=2\n')
  expect(removeKey(t, 'KEY')).toBe('A=1\nB=2\n')
  expect(setKey('A=1\n', 'KEY', pem)).toBe(`A=1\nKEY="${pem}"\n`)
  expect(insertKeyAfter('A=1\r\nB=2\r\n', 0, 'K', 'x\ny')).toBe('A=1\r\nK="x\r\ny"\r\nB=2\r\n')
  // already quoted: kept as typed; a " inside: single quotes
  expect(setKey('', 'K', "'a\nb'")).toBe("K='a\nb'\n")
  expect(setKey('', 'K', 'say "hi"\nok')).toBe(`K='say "hi"\nok'\n`)
})

test('a multi-line value that would not read back is refused', () => {
  expect(() => setKey('', 'K', 'a"\nb\'')).toThrow(/both kinds of quote/)
  expect(() => setKey('', 'K', 'a\nOTHER=1')).toThrow(/looks like another KEY=value/)
})

test('pasted KEY=value lines become keys; other text pastes as text', () => {
  const lines = '# from .env.example\nA=1\n\nB="two"\n'
  expect(pastedPairs(lines, false)).toEqual([{ key: 'A', value: '1' }, { key: 'B', value: '"two"' }])
  expect(pastedPairs(lines, true)).toEqual([{ key: 'A', value: '1' }, { key: 'B', value: '"two"' }])
  // one line: a key anywhere but in a value, where a=b may well be the value
  expect(pastedPairs('TOKEN=abc', false)).toEqual([{ key: 'TOKEN', value: 'abc' }])
  expect(pastedPairs('TOKEN=abc', true)).toBeNull()
  // a PEM block, plain text, or lines mixed with text stay text in a value
  expect(pastedPairs(pem, true)).toBeNull()
  expect(pastedPairs(pem, false)).toBeNull()
  expect(pastedPairs('hello world', false)).toBeNull()
  expect(pastedPairs('A=1\nB=2\nC=3\nD=4\nnot a pair', true)).toBeNull()
  // a quoted PEM value pasted with its key stays one key
  expect(pastedPairs(`KEY="${pem}"\nX=1`, true)).toEqual([{ key: 'KEY', value: `"${pem}"` }, { key: 'X', value: '1' }])
})
