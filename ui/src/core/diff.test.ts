import { expect, test } from 'vitest'
import { envDiff, lineDiff, reapplyEnv, summarize } from './diff'

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
    { kind: 'changed', key: 'B', before: '2', after: '20' },
    { kind: 'added', key: 'D', after: '4' },
    { kind: 'removed', key: 'C', before: '3' },
  ])
})

test('envDiff uses the last value of a repeated key', () => {
  expect(envDiff('A=1\nA=2\n', 'A=2\n')).toEqual([{ kind: 'same', key: 'A', value: '2' }])
})

test('lineDiff splits runs into lines and drops the trailing newline', () => {
  const d = lineDiff('x\ny\n', 'x\nz\n')
  expect(d).toEqual([
    { kind: 'same', text: 'x' },
    { kind: 'del', text: 'y' },
    { kind: 'add', text: 'z' },
  ])
  expect(summarize(d)).toEqual({ added: 1, removed: 1, changed: 0 })
})
