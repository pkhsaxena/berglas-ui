// Saving a secret's value to a file. In the desktop app the core reads the
// value, asks where to save with a native dialog, writes it with mode 0600
// and logs the export to the audit log; the value never passes through the
// page. In a browser the page reads that version again and
// hands it to the browser as a download.
import { api, ApiError, decodeValue, type Ref } from './api'
import { inDesktop } from './desktop'

/** A file name for a secret, matching the core's exportName. */
export function exportName(name: string): string {
  let n = name.slice(name.lastIndexOf('/') + 1).replace(/[/\\:\x00-\x1f]/g, '_')
  if (!n) n = 'secret'
  if (/[-_]env$/.test(n)) n += '.env'
  return n
}

export type ExportResult = { path: string } | { downloaded: string } | { cancelled: true }

/** `confirm` is the secret's name, sent once the confirm word is typed; needed for protected names in the desktop app. */
export async function saveToFile(ref: Ref, confirm?: string): Promise<ExportResult> {
  if (inDesktop()) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (confirm) headers['X-Berglas-Confirm'] = confirm
    const res = await fetch('/api/desktop/save', { method: 'POST', headers, body: JSON.stringify(ref) })
    const data = (await res.json().catch(() => ({}))) as { path?: string; cancelled?: boolean; auditError?: string; error?: { code: string; message: string } }
    if (!res.ok) throw new ApiError(res.status, data.error?.code ?? 'error', data.error?.message ?? `save failed (${res.status})`)
    if (data.auditError) window.dispatchEvent(new CustomEvent('berglas-ui:audit-error', { detail: data.auditError }))
    return data.cancelled ? { cancelled: true } : { path: data.path ?? '' }
  }
  const bytes = decodeValue((await api.read(ref)).plaintext).bytes
  const name = exportName(ref.name)
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { downloaded: name }
}
