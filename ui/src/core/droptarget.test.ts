import { describe, expect, it } from 'vitest'
import { dropChoices } from './droptarget'

const names = ['orders-dev-env', 'orders-prod-env', 'orders-staging-env', 'billing-dev-env', 'payments-dev-env']
const ok = () => ''
const base = { names, query: '', open: null as string | null, suggested: '', writable: true, nameProblem: ok }
const labels = (r: ReturnType<typeof dropChoices>) => r.choices.map((c) => `${c.kind}:${c.name}${c.kind === 'replace' && c.open ? '*' : ''}`)

describe('dropChoices', () => {
  it('offers nothing in a read-only source', () => {
    expect(dropChoices({ ...base, writable: false, query: 'orders' })).toEqual({ choices: [], problem: '' })
  })

  it('with no query: the open secret, then names like the file, then the rest A–Z, then a new secret', () => {
    const r = dropChoices({ ...base, open: 'payments-dev-env', suggested: 'orders-dev' })
    const l = labels(r)
    expect(l.slice(0, 2)).toEqual(['replace:payments-dev-env*', 'replace:orders-dev-env'])
    expect(l.at(-1)).toBe('create:orders-dev')
    // every secret is still listed, once
    expect(l.filter((x) => x.startsWith('replace:')).sort()).toEqual(names.map((n) => `replace:${n}${n === 'payments-dev-env' ? '*' : ''}`).sort())
  })

  it('with no query and no file-name match: open first, the rest A–Z, a new secret named after the file', () => {
    const r = dropChoices({ ...base, open: 'orders-prod-env', suggested: 'zzz' })
    expect(labels(r)).toEqual(['replace:orders-prod-env*', 'replace:billing-dev-env', 'replace:orders-dev-env', 'replace:orders-staging-env', 'replace:payments-dev-env', 'create:zzz'])
  })

  it('a suggested name that already exists is not offered as new; the new secret is then unnamed', () => {
    const r = dropChoices({ ...base, suggested: 'billing-dev-env' })
    expect(r.choices.at(-1)).toEqual({ kind: 'create', name: '' })
    expect(r.choices[0]).toEqual({ kind: 'replace', name: 'billing-dev-env', open: false })
  })

  it('a query matches like ⌘K and offers a new secret with that name', () => {
    const r = dropChoices({ ...base, query: 'prod' })
    expect(labels(r)).toEqual(['replace:orders-prod-env', 'create:prod'])
  })

  it('an exact name is not offered as new', () => {
    const r = dropChoices({ ...base, query: 'orders-dev-env' })
    expect(labels(r)[0]).toBe('replace:orders-dev-env')
    expect(r.choices.some((c) => c.kind === 'create')).toBe(false)
  })

  it('an unusable name is explained instead of offered', () => {
    const r = dropChoices({ ...base, query: 'has space', nameProblem: (n) => (/\s/.test(n) ? 'no spaces in names' : '') })
    expect(r.choices.some((c) => c.kind === 'create')).toBe(false)
    expect(r.problem).toBe('no spaces in names')
  })

  it('on equal scores the open secret comes first', () => {
    const r = dropChoices({ ...base, names: ['a-dev', 'b-dev'], query: 'dev', open: 'b-dev' })
    // b-dev and a-dev have the same length and match position, so the open one leads
    expect(labels(r).slice(0, 2)).toEqual(['replace:b-dev*', 'replace:a-dev'])
  })

  it('caps the list but keeps the new-secret choice', () => {
    const many = Array.from({ length: 30 }, (_, i) => `svc-${String(i).padStart(2, '0')}-dev`)
    const r = dropChoices({ ...base, names: many, query: 'svc', limit: 10 })
    expect(r.choices).toHaveLength(11)
    expect(r.choices.at(-1)).toEqual({ kind: 'create', name: 'svc' })
  })
})
