// Which kind of environment a secret belongs to, so a skin can color-code it
// (and warn before touching production). Skin-neutral: it only names a tone.
import { compileGroup } from './group'

export type EnvTone = 'prod' | 'staging' | 'dev'

const PROD = new Set(['prod', 'production', 'prd', 'live'])
const STAGING = new Set(['nonprod', 'non-prod', 'preprod', 'pre-prod', 'staging', 'stage', 'stg', 'uat', 'qa', 'test', 'testing'])
const DEV = new Set(['dev', 'development', 'local', 'sandbox', 'sbx'])

/** The tone of an environment name ("prod", "nonprod", "dev"…), or null if it is not a known one. */
export function envTone(env: string | null | undefined): EnvTone | null {
  const e = env?.trim().toLowerCase()
  if (!e) return null
  if (PROD.has(e)) return 'prod'
  if (STAGING.has(e)) return 'staging'
  if (DEV.has(e)) return 'dev'
  return null
}

const ENV_NAMES = ['env', 'environment', 'stage']

/**
 * The environment part of a secret name: the {env} (or {environment},
 * {stage}) placeholder of the source's group pattern when the name matches
 * it, else null.
 */
export function envOf(name: string, groupPattern: string | undefined): string | null {
  if (!groupPattern) return null
  const c = compileGroup(groupPattern)
  if (!c) return null
  const at = c.names.findIndex((n) => ENV_NAMES.includes(n.toLowerCase()))
  if (at < 0) return null
  const m = c.re.exec(name)
  return m ? m[at + 1] : null
}

/**
 * The tone of a secret: from the group pattern's env when there is one,
 * otherwise from a word in its name ("payments-prod-env" → prod). Words are
 * split on "-", "_" and "."; "nonprod" is staging, not prod.
 */
export function toneOfSecret(name: string, groupPattern?: string): EnvTone | null {
  const fromPattern = envTone(envOf(name, groupPattern))
  if (fromPattern) return fromPattern
  const words = name.toLowerCase().split(/[-_.]/)
  for (const tone of ['prod', 'staging', 'dev'] as const) {
    if (words.some((w) => envTone(w) === tone)) return tone
  }
  return null
}
