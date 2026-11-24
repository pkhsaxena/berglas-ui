import { describe, expect, it } from 'vitest'
import { suggestShown } from './useSuggest'

const opts = [
  { value: '', label: 'No grouping' },
  { value: '{service}-{env}-env', label: '{service}-{env}-env' },
  { value: '{service}-{env}', label: '{service}-{env}' },
  { value: '{service}_{env}', label: '{service}_{env}' },
]

describe('suggestShown', () => {
  it('shows every suggestion while the field is empty or holds one exactly', () => {
    expect(suggestShown(opts, '')).toHaveLength(4)
    expect(suggestShown(opts, '  ')).toHaveLength(4)
    expect(suggestShown(opts, '{service}-{env}')).toHaveLength(4)
  })
  it('narrows to labels containing the text, in any case', () => {
    expect(suggestShown(opts, '-ENV').map((o) => o.value)).toEqual(['{service}-{env}-env'])
    expect(suggestShown(opts, '_').map((o) => o.value)).toEqual(['{service}_{env}'])
  })
  it('shows nothing when nothing matches, so a pattern of your own is never covered', () => {
    expect(suggestShown(opts, '{team}.{env}')).toEqual([])
  })
})
