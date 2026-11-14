import { describe, expect, it } from 'vitest'
import { MAX_DROP_BYTES, readDropped, suggestName } from './useFileDrop'

describe('suggestName', () => {
  it('drops extensions, dots and unsafe characters', () => {
    expect(suggestName('payments-staging.env')).toBe('payments-staging')
    expect(suggestName('.env')).toBe('')
    expect(suggestName('.env.local')).toBe('env-local')
    expect(suggestName('/Users/x/my secrets (1).txt')).toBe('my-secrets-1')
    expect(suggestName('cert.pem')).toBe('cert')
  })
})

describe('readDropped', () => {
  it('reads text and counts .env keys', async () => {
    const f = await readDropped(new File(['A=1\nB=2\nA=3\n'], 'x.env'))
    expect(f).toMatchObject({ name: 'x.env', text: 'A=1\nB=2\nA=3\n', keys: 2 })
  })
  it('refuses big, binary and empty files', async () => {
    await expect(readDropped(new File([new Uint8Array(MAX_DROP_BYTES + 1)], 'big'))).rejects.toThrow(/not taken/)
    await expect(readDropped(new File([new Uint8Array([0xff, 0xfe, 0x00])], 'bin'))).rejects.toThrow(/not text/)
    await expect(readDropped(new File([''], 'empty'))).rejects.toThrow(/empty/)
  })
  it('gives no key count for plain text', async () => {
    expect((await readDropped(new File(['hello world'], 'k.txt'))).keys).toBeNull()
  })
})
