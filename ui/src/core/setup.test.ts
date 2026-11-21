import { describe, expect, it } from 'vitest'
import { CUSTOM_GROUP, GROUP_PRESETS, groupChoice, groupFit, groupOptions, parseSourceLines, protectCount, protectError, rowErrors, type SetupRow, suggestGroup, suggestProtect, toSource } from './setup'

const row = (over: Partial<SetupRow> = {}): SetupRow => ({ key: 0, backend: 'storage', parent: 'a-bucket', label: '', group: '', kmsKey: '', readOnly: false, ...over })

describe('parseSourceLines', () => {
  it('reads prefixes, bare names, paths, commas and comments', () => {
    const text = 'berglas://one/some/secret\nsm://proj-a, gs://two\n# a comment\nprojects/proj-b\n\nbare  other # trailing'
    expect(parseSourceLines(text, 'storage')).toEqual([
      { backend: 'storage', parent: 'one' },
      { backend: 'sm', parent: 'proj-a' },
      { backend: 'storage', parent: 'two' },
      { backend: 'sm', parent: 'proj-b' },
      { backend: 'storage', parent: 'bare' },
      { backend: 'storage', parent: 'other' },
    ])
  })
  it('takes bare names as the fallback kind', () => {
    expect(parseSourceLines('p1', 'sm')).toEqual([{ backend: 'sm', parent: 'p1' }])
  })
})

describe('rowErrors', () => {
  it('flags empty, bad, taken and repeated rows', () => {
    const errs = rowErrors(
      [row({ parent: '' }), row({ parent: 'has space' }), row({ parent: 'old' }), row({ parent: 'new' }), row({ parent: 'new' }), row({ parent: 'new', backend: 'sm' })],
      [{ backend: 'storage', parent: 'old' }],
    )
    expect(errs).toEqual(['enter a bucket name', 'no spaces or slashes — just the bucket or project id', 'already added', '', 'already added', ''])
  })
  it('checks the group pattern and kms key', () => {
    expect(rowErrors([row({ group: 'no-placeholder' })], [])[0]).toMatch(/placeholder/)
    expect(rowErrors([row({ kmsKey: 'key' })], [])[0]).toMatch(/kms key/)
    expect(rowErrors([row({ group: '{service}-{env}', kmsKey: 'projects/p/locations/global/keyRings/r/cryptoKeys/k' })], [])[0]).toBe('')
  })
})

describe('toSource', () => {
  it('trims and leaves empty fields out; a kms key only for storage', () => {
    expect(toSource(row({ parent: ' b ', label: ' ', group: '{a}', readOnly: true }))).toEqual({ backend: 'storage', parent: 'b', group: '{a}', readOnly: true })
    expect(toSource(row({ backend: 'sm', kmsKey: 'projects/p/locations/l/keyRings/r/cryptoKeys/k' }))).toEqual({ backend: 'sm', parent: 'a-bucket' })
  })
})

describe('grouping', () => {
  const names = ['orders-dev-env', 'orders-prod-env', 'payments-dev-env', 'payments-prod-env', 'tls-cert']
  it('measures a pattern against names', () => {
    expect(groupFit('{service}-{env}-env', names)).toEqual({ pattern: '{service}-{env}-env', matched: 4, total: 5, groups: ['orders', 'payments'], envs: ['dev', 'prod'] })
  })
  it('suggests the preset that groups most names', () => {
    expect(suggestGroup(names)?.pattern).toBe('{service}-{env}-env')
  })
  it('suggests the demo store\'s real pattern, and nothing for names with no shared environment', () => {
    const bucket = ['orders-dev-env', 'orders-prod-env', 'orders-staging-env', 'payments-dev-env', 'payments-prod-env', 'search-api-key', 'tls-cert']
    expect(suggestGroup(bucket)?.pattern).toBe('{service}-{env}-env')
    expect(suggestGroup(['db-password', 'worker-env'])).toBeNull()
    expect(suggestGroup(['api_dev', 'api_prod', 'web_dev'])?.pattern).toBe('{service}_{env}')
  })
  it('suggests nothing when a pattern makes one group or covers under half', () => {
    expect(suggestGroup(['a-dev', 'a-prod'])).toBeNull()
    expect(suggestGroup(['x', 'y', 'z', 'a-dev', 'b-dev'])).toBeNull()
    expect(suggestGroup([])).toBeNull()
  })
})

describe('protect suggestions', () => {
  it('builds production patterns from groups and the envs seen', () => {
    expect(suggestProtect(['{service}-{env}-env'], ['dev', 'production'])).toEqual(['*-production-env', '*-prod-*', '*-prod', '*production*'])
    expect(suggestProtect(['{service}-{env}'], [])).toEqual(['*-prod', '*-prod-*', '*production*'])
  })
  it('counts what a pattern covers and spots bad ones', () => {
    expect(protectCount('*-prod-*', ['a-prod-env', 'a-dev-env', 'x/a-prod-env'])).toBe(1)
    expect(protectError('*-prod-*')).toBe('')
    expect(protectError('[abc')).toMatch(/unclosed/)
    expect(protectError(' ')).toBe('enter a pattern')
  })
})

describe('group picker', () => {
  const names = ['orders-dev-env', 'orders-prod-env', 'billing-dev-env', 'billing-prod-env']
  it('offers no grouping, the presets with how they fit, and a pattern of your own', () => {
    const o = groupOptions(names)
    expect(o.map((x) => x.value)).toEqual(['', ...GROUP_PRESETS, CUSTOM_GROUP])
    expect(o.find((x) => x.value === '{service}-{env}-env')?.hint).toBe('2 groups · 4 of 4 names')
    expect(o.find((x) => x.value === '{service}/{env}')?.hint).toBe('no names fit')
  })
  it('leaves the fit out until the names are listed', () => {
    expect(groupOptions([]).find((x) => x.value === '{service}-{env}')?.hint).toBeUndefined()
  })
  it('shows a preset as itself, nothing as no grouping, anything else (or a picked Custom) as custom', () => {
    expect(groupChoice('{service}-{env}', false)).toBe('{service}-{env}')
    expect(groupChoice('  ', false)).toBe('')
    expect(groupChoice('{team}.{env}', false)).toBe(CUSTOM_GROUP)
    expect(groupChoice('', true)).toBe(CUSTOM_GROUP)
  })
})
