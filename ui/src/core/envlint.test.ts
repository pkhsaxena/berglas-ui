import { describe, expect, it } from 'vitest'
import { lintEnv, warningText } from './envlint'

describe('lintEnv', () => {
  it('finds duplicate keys and empty values', () => {
    const w = lintEnv('A=1\nB=\nC=""\nA=2\nexport D=x\n')
    expect(w).toEqual([
      { kind: 'duplicate', key: 'A', lines: [1, 4], isNew: true },
      { kind: 'empty', key: 'B', line: 2, isNew: true },
      { kind: 'empty', key: 'C', line: 3, isNew: true },
    ])
    expect(warningText(w[0])).toBe('A is set 2 times (lines 1, 4); most loaders use the last one')
  })
  it('marks problems the file already had as not new', () => {
    const w = lintEnv('A=1\nA=2\nB=\nC=\n', 'A=1\nA=2\nB=\n')
    expect(w.map((x) => [x.key, x.isNew])).toEqual([['A', false], ['B', false], ['C', true]])
  })
  it('ignores values that are not .env files', () => {
    expect(lintEnv('-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n')).toEqual([])
  })
})
