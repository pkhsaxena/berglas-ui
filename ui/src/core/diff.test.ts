import { expect, test } from 'vitest'
import { diffValues, envDiff, lineDiff, matchAgainst, reapplyEnv, summarize, unquote } from './diff'

test('reapplyEnv replays my key changes onto a newer version', () => {
  const original = 'A=1\nB=2\nC=3\n'
  const mine = 'A=1\nB=20\nD=4\n' // changed B, removed C, added D
  const theirs = 'A=100\nB=2\nC=3\nE=5\n' // changed A, added E
  expect(reapplyEnv(original, mine, theirs)).toEqual({ text: 'A=100\nB=20\nE=5\nD=4\n', overlaps: [] })
})

test('reapplyEnv flags keys both sides changed; mine wins', () => {
  expect(reapplyEnv('A=1\n', 'A=2\n', 'A=3\n')).toEqual({ text: 'A=2\n', overlaps: ['A'] })
})

test('envDiff reports added, removed, changed and same keys', () => {
  const a = '# c\nA=1\nB=2\nC=3\n'
  const b = 'A=1\nB=20\nexport D=4\n'
  expect(envDiff(a, b)).toEqual([
    { kind: 'same', key: 'A', value: '1' },
    { kind: 'changed', key: 'B', before: '2', after: '20', quotesOnly: false },
    { kind: 'added', key: 'D', after: '4' },
    { kind: 'removed', key: 'C', before: '3' },
  ])
})

test('envDiff uses the last value of a repeated key', () => {
  expect(envDiff('A=1\nA=2\n', 'A=2\n')).toEqual([{ kind: 'same', key: 'A', value: '2' }])
})

test('diffValues: same keys and values despite different text', () => {
  const d = diffValues('# note\nexport A=1\nB=2\n', 'B=2\nA=1\n', true)
  expect([d.identical, d.sameKeys]).toEqual([false, true])
  expect(diffValues('A=1\n', 'A=2\n', true).sameKeys).toBe(false)
  expect(diffValues('x', 'y', false).sameKeys).toBe(false)
})

test('lineDiff splits runs into lines and drops the trailing newline', () => {
  const d = lineDiff('x\ny\n', 'x\nz\n')
  expect(d).toEqual([
    { kind: 'same', text: 'x' },
    { kind: 'del', text: 'y' },
    { kind: 'add', text: 'z' },
  ])
  expect(summarize(d)).toEqual({ added: 1, removed: 1, changed: 0, quotesOnly: 0 })
})

test('matchAgainst marks each draft key and lists keys only the reference has', () => {
  const m = matchAgainst('A=1\nB=2\nX=9\n', 'A=1\nB=20\nC=3\n')
  expect(m.byKey.get('A')?.kind).toBe('same')
  expect(m.byKey.get('B')).toEqual({ kind: 'changed', key: 'B', before: '2', after: '20', quotesOnly: false })
  expect(m.byKey.get('X')?.kind).toBe('removed')
  expect(m.missing).toEqual([{ key: 'C', value: '3' }])
  expect([m.differ, m.extra, m.matches]).toEqual([1, 1, false])
  expect(matchAgainst('A=1\n', '# c\nA=1\n').matches).toBe(true)
})

test('unquote strips one matching pair of quotes only', () => {
  expect(unquote('"abc"')).toBe('abc')
  expect(unquote("'abc'")).toBe('abc')
  expect(unquote('"abc')).toBe('"abc')
  expect(unquote('"abc\'')).toBe('"abc\'')
  expect(unquote(' "abc" ')).toBe(' "abc" ')
  expect(unquote('""')).toBe('')
  expect(unquote('"')).toBe('"')
})

test('values that differ only by quotes are flagged, not hidden', () => {
  const d = envDiff('A="x"\nB=1\nC=\'y\'\n', 'A=x\nB=2\nC="y"\n')
  expect(d).toEqual([
    { kind: 'changed', key: 'A', before: '"x"', after: 'x', quotesOnly: true },
    { kind: 'changed', key: 'B', before: '1', after: '2', quotesOnly: false },
    { kind: 'changed', key: 'C', before: "'y'", after: '"y"', quotesOnly: true },
  ])
  expect(summarize(d)).toEqual({ added: 0, removed: 0, changed: 3, quotesOnly: 2 })
  const v = diffValues('A="x"\n', 'A=x\n', true)
  expect([v.identical, v.sameKeys, v.sameContent]).toEqual([false, false, true])
  expect(diffValues('A="x"\nB=1\n', 'A=x\nB=2\n', true).sameContent).toBe(false)
})

test('matchAgainst: matches apart from quoting', () => {
  const m = matchAgainst('A="x"\nB=2\n', 'A=x\nB=2\n')
  expect([m.matches, m.matchesUnquoted, m.differ, m.quotesOnly]).toEqual([false, true, 1, 1])
  expect(matchAgainst('A=x\n', 'A=x\n').matchesUnquoted).toBe(false)
})

test('matchAgainst lists the keys only the reference has sorted by key, whatever their order there', () => {
  const m = matchAgainst('A=1\n', 'A=1\nZETA=z\nkey_10=b\nKEY_2=a\nBETA=y\n')
  expect(m.missing.map((x) => x.key)).toEqual(['BETA', 'KEY_2', 'key_10', 'ZETA'])
})
