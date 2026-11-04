export type TimeZone = 'local' | 'utc'

export function ago(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'unknown'
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

/** The system's short zone name for a date, e.g. "ist" or "gmt+5:30". */
export function zoneName(d: Date): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')
  return (part?.value ?? 'local').toLowerCase()
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-05-08 11:53 utc", or the same in the system zone with its name. */
export function stamp(iso: string, tz: TimeZone = 'utc'): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'unknown'
  const d = new Date(t)
  if (tz === 'utc') return d.toISOString().replace('T', ' ').slice(0, 16) + ' utc'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${zoneName(d)}`
}
