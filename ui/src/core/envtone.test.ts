import { expect, test } from 'vitest'
import { envOf, envTone, toneOfSecret } from './envtone'

test('known environment names get a tone', () => {
  expect(envTone('prod')).toBe('prod')
  expect(envTone('Production')).toBe('prod')
  expect(envTone('nonprod')).toBe('staging')
  expect(envTone('staging')).toBe('staging')
  expect(envTone('dev')).toBe('dev')
  expect(envTone('eu-west')).toBeNull()
  expect(envTone(undefined)).toBeNull()
})

test('the env placeholder of the group pattern wins', () => {
  expect(envOf('payments-prod-env', '{service}-{env}-env')).toBe('prod')
  expect(envOf('orders-fulfillment-svc-nonprod-env', '{service}-{env}-env')).toBe('nonprod')
  expect(envOf('payments-prod-env', '{service}-{region}-env')).toBeNull()
  expect(envOf('random', '{service}-{env}-env')).toBeNull()
  expect(toneOfSecret('a-dev-thing-prod-env', '{service}-{env}-env')).toBe('prod')
})

test('without a pattern, a word in the name decides; nonprod is not prod', () => {
  expect(toneOfSecret('payments-prod-env')).toBe('prod')
  expect(toneOfSecret('payments-nonprod-env')).toBe('staging')
  expect(toneOfSecret('PAYMENTS_DEV')).toBe('dev')
  expect(toneOfSecret('search-api-key')).toBeNull()
  expect(toneOfSecret('production.db')).toBe('prod')
})
