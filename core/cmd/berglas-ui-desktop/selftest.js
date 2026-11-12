// Run in the desktop web view by BERGLAS_UI_SELFTEST=full (demo store only).
// Checks that the ui loaded and that every kind of api call the ui makes
// reaches the core through the web view, then reports to /__selftest.
;(async () => {
  const checks = []
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail })
  const call = async (method, path, body, headers = {}) => {
    const init = { method, headers: { ...headers } }
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await fetch(path, init)
    let json = null
    try {
      json = await res.json()
    } catch {}
    return { status: res.status, json, csp: res.headers.get('Content-Security-Policy') }
  }
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  const ref = (name) => ({ backend: 'storage', parent: 'demo-bucket', name })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  try {
    check('page origin', true, location.href)
    await new Promise((r) => setTimeout(r, 1500))
    check('ui rendered', document.querySelectorAll('.card').length > 0, `${document.querySelectorAll('.card').length} panes, ${document.querySelectorAll('.rowbtn').length} rows`)

    // copy through the real ui, before the api checks below change the demo data:
    // reveal payments-prod-env and press copy on a key. This overwrites the
    // mac clipboard, and the auto-clear then empties it.
    const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text && b.getBoundingClientRect().width)
    document.querySelector('.rowbtn[aria-label="payments-prod-env"]')?.click()
    await wait(600)
    button('reveal')?.click()
    await wait(600)
    const copyBtn = document.querySelector('button[aria-label="copy LOG_LEVEL"]')
    check('copy button found after reveal', !!copyBtn, copyBtn ? 'yes' : document.querySelector('.card')?.innerText.slice(0, 120))
    copyBtn?.click()
    await wait(500)
    const copied = await (await fetch('/__selftest/clipboard')).text()
    // never echo the clipboard: it may hold the user's own text
    check('copy puts the value on the mac clipboard', copied === 'warn', copied === 'warn' ? 'matches' : 'differs (not shown)')
    await wait(3500) // the test config sets clipboardClearSeconds: 3
    const after = await (await fetch('/__selftest/clipboard')).text()
    check('clipboard auto-clears after clipboardClearSeconds', after === '', after === '' ? 'empty' : 'not empty (not shown)')

    const st = await call('GET', '/api/status')
    check('GET /api/status', st.status === 200, `${st.status} demo=${st.json?.demo}`)
    check('security headers', !!st.csp, st.csp ? 'csp present' : 'no csp')

    const list = await call('GET', '/api/secrets?backend=storage&parent=demo-bucket')
    check('GET /api/secrets (query string)', list.status === 200 && list.json?.secrets?.length > 0, `${list.status} ${list.json?.secrets?.length} secrets`)

    const read = await call('POST', '/api/secrets/read', ref('payments-dev-env'))
    check('POST read (json body)', read.status === 200 && !!read.json?.secret?.plaintext, `${read.status}`)

    const big = 'BIG=' + 'x'.repeat(300 * 1024) + '\n'
    const up = await call('POST', '/api/secrets/update', { ...ref('payments-dev-env'), plaintext: b64(big) })
    const back = await call('POST', '/api/secrets/read', ref('payments-dev-env'))
    const gotLen = back.json?.secret?.plaintext ? atob(back.json.secret.plaintext).length : -1
    check('POST update, 300 KB body round trip', up.status === 200 && gotLen === big.length, `${up.status}, sent ${big.length} bytes, read back ${gotLen}`)

    const noConfirm = await call('POST', '/api/secrets/update', { ...ref('payments-prod-env'), plaintext: b64('A=1\n') })
    check('protected write without confirm → 428', noConfirm.status === 428 && noConfirm.json?.error?.code === 'confirm_required', `${noConfirm.status} ${noConfirm.json?.error?.code}`)

    const confirmed = await call('POST', '/api/secrets/update', { ...ref('payments-prod-env'), plaintext: b64('A=1\n') }, { 'X-Berglas-Confirm': 'payments-prod-env' })
    check('protected write with X-Berglas-Confirm → 200', confirmed.status === 200, `${confirmed.status}`)

    const del = await call('POST', '/api/secrets/delete', ref('search-api-key'), {})
    check('POST delete', del.status === 200 && del.json?.ok === true, `${del.status}`)

    const missing = await call('GET', '/api/nope')
    check('unknown endpoint → 404 json', missing.status === 404 && missing.json?.error?.code === 'not_found', `${missing.status}`)

    const spa = await fetch('/some/client/route')
    check('client route falls back to index.html', spa.status === 200 && (await spa.text()).includes('<div id="root"'), `${spa.status}`)

    // desktop routes
    check('GET /api/desktop', (await fetch('/api/desktop')).ok, 'desktop mode on')

    // a mailto link leaves the app instead of replacing it
    const before = location.href
    const mail = document.querySelector('a[href^="mailto:"]')
    mail?.click()
    await wait(400)
    const opened = await (await fetch('/__selftest/opened')).text()
    check('mailto link handed to the system, app stays', !!mail && opened.startsWith('mailto:') && location.href === before, `opened ${JSON.stringify(opened)}, page ${location.href}`)
    await wait(3000) // time for a port check from outside
  } catch (e) {
    check('exception', false, String(e))
  }
  const ok = checks.every((c) => c.ok)
  await fetch('/__selftest?ok=' + (ok ? 1 : 0), { method: 'POST', body: JSON.stringify(checks) })
})()
