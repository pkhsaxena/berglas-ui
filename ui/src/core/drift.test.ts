import { describe, expect, it } from 'vitest'
import type { DriftSecret } from './api'
import { driftTable, groupLabel } from './drift'

const sec = (name: string, keys: [string, string, string?, boolean?][]): DriftSecret => ({
  name,
  version: '1',
  env: true,
  keys: keys.map(([key, fp, exact, empty]) => ({ key, fp, exact: exact ?? fp, empty })),
})

const cols = [
  { env: 'dev', name: 'o-dev-env' },
  { env: 'staging', name: 'o-staging-env' },
  { env: 'prod', name: 'o-prod-env' },
]

describe('driftTable', () => {
  const t = driftTable(cols, [
    sec('o-dev-env', [['API', 'a1'], ['QUEUE', 'q1'], ['TIMEOUT', 't1', 'plain'], ['ONLY_DEV', 'x'], ['DSN', 'e', 'e', true]]),
    sec('o-staging-env', [['API', 'a2'], ['QUEUE', 'q2'], ['TIMEOUT', 't1', 'quoted'], ['DSN', 'd2']]),
    sec('o-prod-env', [['API', 'a3'], ['QUEUE', 'q2'], ['TIMEOUT', 't1', 'plain'], ['DSN', 'd3']]),
  ])
  const row = (k: string) => t.rows.find((r) => r.key === k)!

  it('sorts keys and counts kinds', () => {
    expect(t.rows.map((r) => r.key)).toEqual(['API', 'DSN', 'ONLY_DEV', 'QUEUE', 'TIMEOUT'])
    expect(t.counts).toEqual({ keys: 5, same: 1, differs: 3, missing: 1, warnings: 1 })
  })

  it('groups equal values left to right', () => {
    expect(row('QUEUE').cells.map((c) => (c.state === 'value' ? groupLabel(c.group) : c.state))).toEqual(['A', 'B', 'B'])
    expect(row('ONLY_DEV').cells.map((c) => c.state)).toEqual(['value', 'missing', 'missing'])
  })

  it('warns when prod equals a non-prod value', () => {
    expect(row('QUEUE').warnings).toEqual(['prod = staging'])
    expect(row('API').warnings).toEqual([])
  })

  it('marks quote-only differences', () => {
    expect(row('TIMEOUT').kind).toBe('same')
    expect(row('TIMEOUT').cells.every((c) => c.state === 'value' && c.quotesOnly)).toBe(true)
  })

  it('flags an empty prod value, not an empty dev one', () => {
    const e = driftTable(cols, [sec('o-dev-env', [['K', 'e', 'e', true]]), sec('o-staging-env', [['K', 'e', 'e', true]]), sec('o-prod-env', [['K', 'e', 'e', true]])])
    expect(e.rows[0].warnings).toEqual(['empty in prod'])
  })

  it('leaves out columns with no secret, an error or a non-env value', () => {
    const p = driftTable(
      [...cols, { env: 'qa', name: null }],
      [sec('o-dev-env', [['K', '1']]), { name: 'o-staging-env', env: false, value: 'v' }, { name: 'o-prod-env', env: false, error: 'permission denied' }],
    )
    expect(p.columns.map((c) => c.problem)).toEqual([undefined, 'not a .env file', 'permission denied', 'no secret'])
    expect(p.rows[0].cells.map((c) => c.state)).toEqual(['value', 'none', 'none', 'none'])
    expect(p.rows[0].kind).toBe('same')
  })

  it('gives letters to non-empty values first', () => {
    const e = driftTable(cols, [sec('o-dev-env', [['K', 'e', 'e', true]]), sec('o-staging-env', [['K', 's']]), sec('o-prod-env', [['K', 'p']])])
    expect(e.rows[0].cells.map((c) => (c.state === 'value' ? (c.empty ? '∅' : groupLabel(c.group)) : c.state))).toEqual(['∅', 'A', 'B'])
  })

  it('labels groups past Z', () => {
    expect([groupLabel(0), groupLabel(25), groupLabel(26)]).toEqual(['A', 'Z', 'A2'])
  })
})
