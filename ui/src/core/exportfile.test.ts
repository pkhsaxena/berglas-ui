import { describe, expect, it } from 'vitest'
import { exportName } from './exportfile'

describe('exportName', () => {
  it('matches the core', () => {
    expect(exportName('payments-dev-env')).toBe('payments-dev-env.env')
    expect(exportName('a/b/tls-cert')).toBe('tls-cert')
    expect(exportName('x:y')).toBe('x_y')
    expect(exportName('db_env')).toBe('db_env.env')
  })
})
