import { expect, test } from 'vitest'
import { compileGroup, groupByPattern } from './group'

const names = ['web-dev-env', 'pay-svc-prod-env', 'pay-svc-dev-env', 'random', 'web-prod-env']

test('groups by the first placeholder, greedy, labelled by the rest', () => {
  expect(groupByPattern(names, (n) => n, '{service}-{env}-env')).toEqual([
    { key: 'pay-svc', items: [{ item: 'pay-svc-prod-env', label: 'prod' }, { item: 'pay-svc-dev-env', label: 'dev' }] },
    { key: 'web', items: [{ item: 'web-dev-env', label: 'dev' }, { item: 'web-prod-env', label: 'prod' }] },
    { key: null, items: [{ item: 'random', label: 'random' }] },
  ])
})

test('one placeholder keeps full names as labels; literals are escaped', () => {
  expect(groupByPattern(['a.b', 'axb'], (n) => n, '{x}.b')).toEqual([{ key: 'a', items: [{ item: 'a.b', label: 'a.b' }] }, { key: null, items: [{ item: 'axb', label: 'axb' }] }])
  expect(compileGroup('no placeholders')).toBeNull()
})
