import { expect, test } from 'vitest'
import type { Secret } from './api'
import { matrixOf, overview, sortMatrixRows } from './overview'

const now = Date.parse('2026-06-01T00:00:00Z')
const at = (days: number) => new Date(now - days * 86_400_000).toISOString()
const s = (name: string, days: number, kmsKey?: string): Secret => ({ backend: 'storage', parent: 'b', name, updatedAt: at(days), kmsKey })

const list = [s('api-prod-env', 2, 'k1'), s('api-dev-env', 40, 'k1'), s('web-dev-env', 200, 'k2'), s('loose', 400)]

test('overview counts, recency, staleness and keys', () => {
  const o = overview(list, '{service}-{env}-env', now)
  expect(o.count).toBe(4)
  expect(o.newest?.name).toBe('api-prod-env')
  expect([o.changed7d, o.changed30d]).toEqual([1, 1])
  expect(o.stale.map((x) => x.name)).toEqual(['loose', 'web-dev-env'])
  expect(o.recent.map((x) => x.name)).toEqual(['api-prod-env', 'api-dev-env', 'web-dev-env', 'loose'])
  expect(o.kmsKeys).toEqual([
    { key: 'k1', count: 2 },
    { key: 'k2', count: 1 },
  ])
})

test('matrix orders known environments and leaves gaps empty', () => {
  const m = matrixOf(list, '{service}-{env}-env')!
  expect(m.cols).toEqual(['dev', 'prod'])
  expect(m.rows.map((r) => [r.key, r.cells.map((c) => c?.name ?? null)])).toEqual([
    ['api', ['api-dev-env', 'api-prod-env']],
    ['web', ['web-dev-env', null]],
  ])
  expect(matrixOf(list, '{service}')).toBeNull()
  expect(matrixOf(list, undefined)).toBeNull()
})

test('sortMatrixRows orders by one env, missing cells last, default order otherwise', () => {
  const m = matrixOf([s('a-dev-env', 30), s('b-dev-env', 5), s('c-dev-env', 90), s('d-prod-env', 1)], '{service}-{env}-env')!
  const order = (x: typeof m) => x.rows.map((r) => r.key)
  expect(order(m)).toEqual(['a', 'b', 'c', 'd'])
  expect(order(sortMatrixRows(m, 'dev', 'asc'))).toEqual(['b', 'a', 'c', 'd'])
  expect(order(sortMatrixRows(m, 'dev', 'desc'))).toEqual(['c', 'a', 'b', 'd'])
  expect(order(sortMatrixRows(m, null, 'asc'))).toEqual(['a', 'b', 'c', 'd'])
  expect(order(sortMatrixRows(m, 'nope', 'asc'))).toEqual(['a', 'b', 'c', 'd'])
})
