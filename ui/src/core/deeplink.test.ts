import { describe, expect, it } from 'vitest'
import { onOpenLink, openLink } from './commands'
import { linkFor } from './deeplink'

describe('deep links', () => {
  it('builds an encoded link', () => {
    expect(linkFor({ backend: 'storage', parent: 'demo-bucket', name: 'a/b c' })).toBe('berglas-ui://open?backend=storage&parent=demo-bucket&name=a%2Fb+c')
  })
  it('queues links that arrive before a handler', () => {
    openLink({ backend: 'sm', parent: 'p', name: 'n' })
    const got: string[] = []
    const off = onOpenLink((t) => got.push(t.name))
    openLink({ backend: 'storage', parent: 'b', name: 'm' })
    off()
    expect(got).toEqual(['n', 'm'])
  })
})
