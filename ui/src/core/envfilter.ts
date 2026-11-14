// Filtering a revealed .env value by what you type: a key or value containing
// the text (any case) matches. An empty query matches everything.

export function matchesQuery(key: string, value: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return key.toLowerCase().includes(q) || value.toLowerCase().includes(q)
}
