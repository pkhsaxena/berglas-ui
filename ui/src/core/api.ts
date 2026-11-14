// Typed client for the core's JSON api. The ui only talks to this interface,
// so a desktop shell can swap the transport without touching screens.
import type { TimeZone } from './time'

export type Backend = 'storage' | 'sm'

export type EnvOrder = 'sorted' | 'file'

export type Secret = {
  backend: Backend
  parent: string
  name: string
  version?: string
  generation?: string
  metageneration?: string
  kmsKey?: string
  locations?: string[]
  updatedAt: string
  /** base64; only present on read */
  plaintext?: string
}

export type Ref = { backend: Backend; parent: string; name: string; version?: string }

export type Status = {
  version: string
  credentials: boolean
  account?: string
  project?: string
  error?: string
  hint?: string
  /** in-memory demo store; nothing reaches google cloud */
  demo?: boolean
  /** service account the core acts as, from credentials.impersonateServiceAccount */
  impersonating?: string
  quotaProject?: string
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Header carrying the typed secret name for writes to a protected name. */
const CONFIRM_HEADER = 'X-Berglas-Confirm'

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, confirm?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (confirm) headers[CONFIRM_HEADER] = confirm
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'offline', 'cannot reach the core — is berglas-ui still running?')
  }
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(res.status, 'bad_response', `unexpected response (${res.status})`)
  }
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string } }).error
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `request failed (${res.status})`)
  }
  const auditError = (data as { auditError?: string }).auditError
  if (auditError) window.dispatchEvent(new CustomEvent(AUDIT_ERROR_EVENT, { detail: auditError }))
  return data as T
}

const AUDIT_ERROR_EVENT = 'berglas-ui:audit-error'

/**
 * Calls cb when a write succeeded but the core could not add it to the audit
 * log. Returns an unsubscribe function.
 */
export function onAuditError(cb: (message: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail)
  window.addEventListener(AUDIT_ERROR_EVENT, h)
  return () => window.removeEventListener(AUDIT_ERROR_EVENT, h)
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString()

/** A source as stored in the config file; see core/internal/config. */
export type SourceConfig = {
  backend: Backend
  parent: string
  label?: string
  kmsKey?: string
  readOnly?: boolean
  protect?: string[]
  group?: string
  default?: boolean
}

/** The resolved config the core returns (defaults applied). */
export type Config = {
  /** the ui skin to load; the ui falls back to its default for unknown names */
  skin?: string
  theme?: string
  timeZone: TimeZone
  /** .env views: sorted by section and key, or in file order */
  envOrder: EnvOrder
  readOnly: boolean
  protect: string[]
  revealSeconds: number
  clipboardClearSeconds: number
  /** how long cached secret and version lists are kept; 0 = no cache */
  cacheSeconds: number
  /** at most this many cached lists */
  cacheEntries: number
  /** ui zoom in percent */
  zoom: number
  auditLog: string
  credentials: { impersonateServiceAccount?: string; quotaProject?: string }
  sources: SourceConfig[]
  /** where the core keeps the file, for display */
  path: string
}

export const api = {
  status: () => call<Status>('GET', '/api/status'),
  config: () => call<Config>('GET', '/api/config'),
  setConfig: (c: Partial<Pick<Config, 'skin' | 'zoom' | 'theme' | 'timeZone' | 'envOrder' | 'sources'>>) => call<Config>('POST', '/api/config', c),
  list: (backend: Backend, parent: string, prefix = '') =>
    call<{ secrets: Secret[] }>('GET', `/api/secrets?${qs({ backend, parent, prefix })}`).then((r) => r.secrets),
  versions: (r: Ref) =>
    call<{ versions: Secret[] }>('GET', `/api/secrets/versions?${qs({ backend: r.backend, parent: r.parent, name: r.name })}`).then(
      (x) => x.versions,
    ),
  /** Per-key fingerprints of several .env secrets (latest versions); never values. See ./drift. */
  drift: (backend: Backend, parent: string, names: string[]) =>
    call<{ secrets: DriftSecret[] }>('POST', '/api/secrets/drift', { backend, parent, names }).then((x) => x.secrets),
  read: (r: Ref) => call<{ secret: Secret }>('POST', '/api/secrets/read', r).then((x) => x.secret),
  /** `confirm` is the typed secret name, needed when the name is protected. */
  update: (u: UpdateInput, confirm?: string) => call<{ secret: Secret }>('POST', '/api/secrets/update', u, confirm).then((x) => x.secret),
  /** kmsKey may be left out for storage when the source has one in the config. */
  create: (c: CreateInput, confirm?: string) => call<{ secret: Secret }>('POST', '/api/secrets/create', c, confirm).then((x) => x.secret),
  remove: (r: Omit<Ref, 'version'>, confirm?: string) => call<{ ok: boolean }>('POST', '/api/secrets/delete', r, confirm),
}

/**
 * One secret as the drift route sees it. fp fingerprints a value without
 * surrounding quotes, exact as written; both are HMACs under a key that only
 * the running core has, so equal values match but nothing can be read back.
 */
export type DriftSecret = {
  name: string
  version?: string
  /** false when the value isn't a .env file; `value` then fingerprints all of it */
  env: boolean
  keys?: { key: string; fp: string; exact: string; empty?: boolean }[]
  value?: string
  error?: string
}

export type CreateInput = {
  backend: Backend
  parent: string
  name: string
  /** base64 */
  plaintext: string
  kmsKey?: string
}

/**
 * Writes a new version. The expected* fields carry what was loaded; the core
 * rejects the write with 409 "modified" if the secret moved on since.
 */
export type UpdateInput = {
  backend: Backend
  parent: string
  name: string
  /** base64 */
  plaintext: string
  expectedGeneration?: string
  expectedMetageneration?: string
  expectedVersion?: string
}

export function encodeText(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** The id of a version: generation for storage, version for secret manager. */
export const versionOf = (s: Secret) => (s.backend === 'storage' ? s.generation : s.version) ?? ''

export function refString(r: Ref): string {
  const base = `${r.backend === 'storage' ? 'berglas' : 'sm'}://${r.parent}/${r.name}`
  return r.version ? `${base}#${r.version}` : base
}

export function decodeValue(b64: string | undefined): { bytes: Uint8Array; text: string | null } {
  const bin = atob(b64 ?? '')
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  try {
    return { bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { bytes, text: null }
  }
}
