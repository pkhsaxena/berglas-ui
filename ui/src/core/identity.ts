// The "act as" choices: your own ADC login, the config's credentials.choices,
// and the identity in use if it isn't one of them.
import type { Config } from './api'

export type IdentityOption = { key: string; label: string; serviceAccount: string; quotaProject: string }

const keyOf = (sa: string, q: string) => `${sa}|${q}`

/** The options, and the key of the one in use. */
export function identityOptions(c: Config['credentials'] | undefined): { options: IdentityOption[]; current: string } {
  const sa = c?.impersonateServiceAccount ?? ''
  const q = c?.quotaProject ?? ''
  const options: IdentityOption[] = []
  const add = (label: string, s: string, quota: string) => {
    const key = keyOf(s, quota)
    if (!options.some((o) => o.key === key)) options.push({ key, label, serviceAccount: s, quotaProject: quota })
  }
  add('you (your gcloud login)', '', '')
  for (const ch of c?.choices ?? []) {
    const s = ch.impersonateServiceAccount ?? ''
    const quota = ch.quotaProject ?? ''
    add(ch.label || (s ? s.split('@')[0] : 'you') + (quota ? ` · quota ${quota}` : ''), s, quota)
  }
  add(sa ? sa.split('@')[0] + (q ? ` · quota ${q}` : '') : `you · quota ${q}`, sa, q)
  return { options, current: keyOf(sa, q) }
}
