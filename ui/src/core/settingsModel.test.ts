import { describe, expect, it } from 'vitest'
import type { Source } from './sources'
import {
  choiceOptions,
  draftChanges,
  draftPatch,
  type Field,
  type FieldValues,
  fieldFor,
  formatValue,
  ITEMS,
  isField,
  matchesQuery,
  parseList,
  parseNumber,
  SECTIONS,
  visibleSections,
  withSourceDetail,
} from './settingsModel'

const saved: FieldValues = {
  skin: 'terminal',
  theme: 'Dracula',
  zoom: 100,
  timeZone: 'local',
  envOrder: 'sorted',
  recentCollapsed: false,
  sidebarCollapsed: false,
  readOnly: false,
  protect: ['*-prod-*'],
  lockAfterMinutes: 0,
  revealSeconds: 60,
  clipboardClearSeconds: 30,
  allowScreenCapture: false,
  allowUniversalClipboard: false,
  auditLog: '',
  cacheSeconds: 600,
  cacheEntries: 500,
  watchMinutes: 5,
  listen: '',
  openBrowser: false,
}

const sources: Source[] = [
  { backend: 'storage', parent: 'b1', label: 'team', default: true },
  { backend: 'sm', parent: 'p1', readOnly: true, protect: ['db-*'] },
]

describe('the settings list', () => {
  it('has every setting of the config file exactly once, in a known section', () => {
    const keys = ITEMS.filter(isField).map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual(Object.keys(saved).sort())
    for (const i of ITEMS) expect(SECTIONS.some((s) => s.id === i.section)).toBe(true)
  })

  it('marks the settings that guard secrets as safety settings', () => {
    const safety = ITEMS.filter((i): i is Field => isField(i) && !!i.safety).map((f) => f.key)
    expect(safety.sort()).toEqual(['allowScreenCapture', 'allowUniversalClipboard', 'auditLog', 'clipboardClearSeconds', 'lockAfterMinutes', 'protect', 'readOnly', 'revealSeconds'])
  })
})

describe('search', () => {
  it('matches every word, in label, help, config key, keywords or section', () => {
    const reveal = fieldFor('revealSeconds')
    expect(matchesQuery(reveal, '')).toBe(true)
    expect(matchesQuery(reveal, 'REVEAL')).toBe(true)
    expect(matchesQuery(reveal, 'revealseconds')).toBe(true)
    expect(matchesQuery(reveal, 'safety hide')).toBe(true)
    expect(matchesQuery(reveal, 'hide clipboard')).toBe(false)
  })

  it('keeps only sections with a match, and finds a block by its content', () => {
    expect(visibleSections('').map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id))
    // a section's title matches for all of its settings
    const cache = visibleSections('cache')
    expect(cache.map((s) => s.id)).toEqual(['background'])
    expect(cache[0].items.map((i) => i.key)).toEqual(['cacheSeconds', 'cacheEntries', 'watchMinutes'])
    expect(visibleSections('clipboard').flatMap((s) => s.items.map((i) => i.key))).toEqual(['clipboardClearSeconds', 'allowUniversalClipboard'])
    expect(visibleSections('zzz')).toEqual([])
    // the mac app leaves the browser version's section out, also from a search
    expect(visibleSections('', {}, ['browser']).map((s) => s.id)).not.toContain('browser')
    expect(visibleSections('listen', {}, ['browser'])).toEqual([])
    expect(visibleSections('listen').map((s) => s.id)).toEqual(['browser'])
    expect(visibleSections('team-bucket', { sources: 'team-bucket b1' }).map((s) => s.id)).toEqual(['sources'])
  })
})

describe('typed values', () => {
  const reveal = fieldFor('revealSeconds') as Extract<Field, { kind: 'number' }>
  const watch = fieldFor('watchMinutes') as Extract<Field, { kind: 'number' }>

  it('takes whole numbers within the limits', () => {
    expect(parseNumber(reveal, ' 15 ')).toEqual({ ok: true, value: 15 })
    expect(parseNumber(reveal, '0')).toEqual({ ok: true, value: 0 })
    for (const bad of ['', 'abc', '-1', '1.5', '1e3']) expect(parseNumber(reveal, bad).ok).toBe(false)
    expect(parseNumber(watch, '0')).toEqual({ ok: false, error: 'at least 1' })
  })

  it('splits a pattern list on commas, spaces and lines, without blanks or repeats', () => {
    expect(parseList(' *-prod-*, db-*\n*-prod-* ,, ')).toEqual(['*-prod-*', 'db-*'])
    expect(parseList('')).toEqual([])
  })

  it('says values in words', () => {
    expect(formatValue(reveal, 0)).toBe('never')
    expect(formatValue(reveal, 20)).toBe('20 seconds')
    expect(formatValue(fieldFor('readOnly'), true)).toBe('on')
    expect(formatValue(fieldFor('protect'), [])).toBe('none')
    expect(formatValue(fieldFor('auditLog'), '')).toBe('off')
  })
})

describe('the safety draft', () => {
  it('lists only what differs from the saved values', () => {
    expect(draftChanges(saved, sources, {})).toEqual([])
    expect(draftChanges(saved, sources, { readOnly: false, revealSeconds: 60, protect: ['*-prod-*'], sources: { 'sm:p1': { readOnly: true, protect: ['db-*'] } } })).toEqual([])
    expect(draftChanges(saved, sources, { readOnly: true, revealSeconds: 0, sources: { 'storage:b1': { readOnly: true }, 'sm:p1': { protect: [] } } })).toEqual([
      { id: 'readOnly', label: 'Read-only', from: 'off', to: 'on' },
      { id: 'revealSeconds', label: 'Hide revealed values after', from: '60 seconds', to: 'never' },
      { id: 'storage:b1 readOnly', label: 'team: read-only', from: 'off', to: 'on' },
      { id: 'sm:p1 protect', label: 'p1: protected names', from: 'db-*', to: 'none' },
    ])
  })

  it('becomes one save holding only the changes, sources included whole', () => {
    expect(draftPatch(saved, sources, { readOnly: false, lockAfterMinutes: 10 })).toEqual({ lockAfterMinutes: 10 })
    expect(draftPatch(saved, sources, { readOnly: true, sources: { 'sm:p1': { readOnly: false, protect: [] }, 'storage:b1': { protect: ['x-*'] } } })).toEqual({
      readOnly: true,
      sources: [
        { backend: 'storage', parent: 'b1', label: 'team', default: true, protect: ['x-*'] },
        { backend: 'sm', parent: 'p1' },
      ],
    })
  })
})

describe('source details', () => {
  it('sets a field, clears it with empty text, and keeps one default', () => {
    expect(withSourceDetail(sources, 'sm:p1', { label: ' prod ' })[1]).toEqual({ backend: 'sm', parent: 'p1', readOnly: true, protect: ['db-*'], label: 'prod' })
    expect(withSourceDetail(sources, 'storage:b1', { label: '' })[0]).toEqual({ backend: 'storage', parent: 'b1', default: true })
    const moved = withSourceDetail(sources, 'sm:p1', { default: true })
    expect(moved.map((s) => !!s.default)).toEqual([false, true])
    expect(withSourceDetail(sources, 'storage:b1', { default: false }).some((s) => s.default)).toBe(false)
  })
})

describe('choices', () => {
  it('offers the current zoom even when it is not a step', () => {
    const c = choiceOptions({ skins: [{ name: 'terminal', label: 'terminal' }], themes: ['Dracula'], zoomSteps: [50, 100, 200], zoom: 133, localZone: 'IST' })
    expect(c.zoom.map((o) => o.value)).toEqual(['50', '100', '133', '200'])
    expect(c.timeZone[0].label).toBe('Local (IST)')
  })
})
