import { describe, expect, it } from 'vitest'
import { envLines, exportLines } from './envcopy'

describe('envLines', () => {
  it('keeps values as written', () => {
    expect(envLines([{ key: 'A', value: '"x y"' }, { key: 'B', value: '1' }])).toBe('A="x y"\nB=1\n')
  })
})

describe('exportLines', () => {
  it('single-quotes values so a shell expands nothing, and drops one pair of quotes', () => {
    const r = exportLines([
      { key: 'A', value: '"$HOME and `cmd`"' },
      { key: 'B', value: "it's" },
      { key: 'C', value: '' },
    ])
    expect(r.text).toBe(`export A='$HOME and \`cmd\`'\nexport B='it'\\''s'\nexport C=''\n`)
    expect(r.skipped).toEqual([])
  })
  it('leaves out keys a shell cannot name', () => {
    const r = exportLines([{ key: 'a.b', value: '1' }, { key: 'x-y', value: '2' }, { key: 'OK', value: '3' }, { key: 'a.b', value: '4' }])
    expect(r.text).toBe("export OK='3'\n")
    expect(r.skipped).toEqual(['a.b', 'x-y'])
  })
})
