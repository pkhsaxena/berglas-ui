// Typed client for the core's JSON api. The ui only talks to this interface,
// so a desktop shell can swap the transport without touching screens.

export type Backend = 'storage' | 'sm'

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

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
  return data as T
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString()

export type Config = {
  theme?: string
  sources: { backend: Backend; parent: string }[]
  /** where the core keeps the file, for display */
  path: string
}

export const api = {
  status: () => call<Status>('GET', '/api/status'),
  config: () => call<Config>('GET', '/api/config'),
  setConfig: (c: Partial<Pick<Config, 'theme' | 'sources'>>) => call<Config>('POST', '/api/config', c),
  list: (backend: Backend, parent: string, prefix = '') =>
    call<{ secrets: Secret[] }>('GET', `/api/secrets?${qs({ backend, parent, prefix })}`).then((r) => r.secrets),
  versions: (r: Ref) =>
    call<{ versions: Secret[] }>('GET', `/api/secrets/versions?${qs({ backend: r.backend, parent: r.parent, name: r.name })}`).then(
      (x) => x.versions,
    ),
  read: (r: Ref) => call<{ secret: Secret }>('POST', '/api/secrets/read', r).then((x) => x.secret),
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
