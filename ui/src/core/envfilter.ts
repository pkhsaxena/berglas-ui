// Filtering a revealed .env value by what you type, any case. A key matches
// when the text is in its key, in its value, or in its whole KEY=value line
// (so a copied line finds itself); or when every word of the text (split on
// spaces) is in the key or the value, so "log warn" finds LOG_LEVEL=warn. An
// empty query matches everything.

export function matchesQuery(key: string, value: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const k = key.toLowerCase()
  const v = value.toLowerCase()
  if (k.includes(q) || v.includes(q) || `${k}=${v}`.includes(q)) return true
  const words = q.split(/\s+/)
  return words.length > 1 && words.every((w) => k.includes(w) || v.includes(w))
}
