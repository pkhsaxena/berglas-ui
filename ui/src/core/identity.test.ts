import { describe, expect, it } from 'vitest'
import { identityOptions } from './identity'

describe('identityOptions', () => {
  it('lists you, the choices, and the current identity once', () => {
    const { options, current } = identityOptions({
      impersonateServiceAccount: 'reader@p.iam.gserviceaccount.com',
      choices: [{ label: 'deployer', impersonateServiceAccount: 'deploy@p.iam.gserviceaccount.com' }, { label: 'me' }],
    })
    expect(options.map((o) => o.label)).toEqual(['you (your gcloud login)', 'deployer', 'reader'])
    expect(current).toBe('reader@p.iam.gserviceaccount.com|')
  })
  it('is just you with no config', () => {
    expect(identityOptions(undefined)).toEqual({ options: [{ key: '|', label: 'you (your gcloud login)', serviceAccount: '', quotaProject: '' }], current: '|' })
  })
})
