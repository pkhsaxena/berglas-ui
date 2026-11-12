// BERGLAS_UI_SELFTEST=status: does the app find google credentials when it is
// started from Finder? Reports only yes/no and the error, never the account.
;(async () => {
  const checks = []
  try {
    const r = await fetch('/api/status')
    const s = await r.json()
    checks.push({ name: 'GET /api/status', ok: r.status === 200, detail: String(r.status) })
    checks.push({ name: 'google credentials found', ok: s.credentials === true, detail: s.credentials ? 'yes' : `no — ${s.error ?? ''}` })
  } catch (e) {
    checks.push({ name: 'exception', ok: false, detail: String(e) })
  }
  const ok = checks.every((c) => c.ok)
  await fetch('/__selftest?ok=' + (ok ? 1 : 0), { method: 'POST', body: JSON.stringify(checks) })
})()
