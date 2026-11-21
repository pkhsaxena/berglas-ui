import { expect, test } from 'vitest'
import { compareKeys, sortEnv } from './envsort'

const keys = (s: ReturnType<typeof sortEnv>['sections'][number]) => s.items.map((i) => i.line.key)

const file = `# orders service

# Server
WRITE_TIMEOUT=30
PORT=8080
# in seconds
READ_TIMEOUT=30

# Database
DB_POOL=10
DATABASE_URL=postgres://x

LOG_LEVEL=info
K10=j
K2=b
`

test('sections sort by header, keys sort inside, file comments and loose keys are separated', () => {
  const s = sortEnv(file)
  expect(s.fileComments.map((c) => c.raw)).toEqual(['# orders service'])
  expect(s.sections.map((x) => x.title)).toEqual(['', 'Database', 'Server'])
  expect(keys(s.sections[0])).toEqual(['K2', 'K10', 'LOG_LEVEL'])
  expect(keys(s.sections[1])).toEqual(['DATABASE_URL', 'DB_POOL'])
  expect(keys(s.sections[2])).toEqual(['PORT', 'READ_TIMEOUT', 'WRITE_TIMEOUT'])
})

test('a comment between keys stays with the key below it', () => {
  const server = sortEnv(file).sections.find((x) => x.title === 'Server')!
  expect(server.items.find((i) => i.line.key === 'READ_TIMEOUT')!.notes.map((n) => n.raw)).toEqual(['# in seconds'])
  expect(server.items.find((i) => i.line.key === 'PORT')!.notes).toEqual([])
})

test('every entry keeps its line index, and each section knows its last key line', () => {
  const s = sortEnv(file)
  const lines = file.split('\n')
  for (const sec of s.sections) for (const it of sec.items) expect(lines[it.index]).toBe(it.line.raw)
  const server = s.sections.find((x) => x.title === 'Server')!
  expect(lines[server.lastKeyIndex]).toBe('READ_TIMEOUT=30')
  expect(lines[s.sections[0].lastKeyIndex]).toBe('K2=b')
})

test('headerless blocks merge into one group; duplicate keys keep file order', () => {
  const s = sortEnv('B=1\nA=1\n\nA=2\nC=3\n')
  expect(s.sections).toHaveLength(1)
  expect(s.sections[0].items.map((i) => `${i.line.key}=${i.line.value}`)).toEqual(['A=1', 'A=2', 'B=1', 'C=3'])
})

test('compareKeys ignores case and puts numbers in number order', () => {
  expect(['KEY_10', 'b', 'KEY_2', 'A'].sort(compareKeys)).toEqual(['A', 'b', 'KEY_2', 'KEY_10'])
})
