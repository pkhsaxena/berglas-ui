import { describe, expect, it } from 'vitest'
import { filterOptions } from './useCombo'

const opts = [
  { value: 'a', label: 'Dracula' },
  { value: 'b', label: 'Solarized Light', hint: 'light' },
  { value: 'c', label: 'Nord' },
]

describe('filterOptions', () => {
  it('matches a substring anywhere, ignoring case', () => {
    expect(filterOptions(opts, 'ACU').map((o) => o.value)).toEqual(['a'])
    expect(filterOptions(opts, 'ized li').map((o) => o.value)).toEqual(['b'])
  })
  it('matches hints and keeps everything for an empty query', () => {
    expect(filterOptions(opts, 'light').map((o) => o.value)).toEqual(['b'])
    expect(filterOptions(opts, '  ')).toHaveLength(3)
  })
  it('is not fuzzy: letters must be adjacent', () => {
    expect(filterOptions(opts, 'dla')).toEqual([])
  })
})
