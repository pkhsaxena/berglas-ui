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
    check('ui rendered', document.querySelectorAll('.card, .pane').length > 0, `${document.querySelectorAll('.card, .pane').length} panes, ${document.querySelectorAll('.rowbtn').length} rows, css ${[...document.styleSheets].map((x) => (x.href || '').split('/').pop().split('-')[0]).filter(Boolean).join(',')}`)

    // copy through the real ui, before the api checks below change the demo data:
    // reveal payments-prod-env and press copy on a key. This overwrites the
    // mac clipboard, and the auto-clear then empties it.
    const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase() === text && b.getBoundingClientRect().width)
    document.querySelector('.rowbtn[aria-label="payments-prod-env"]')?.click()
    await wait(600)
    button('reveal')?.click()
    await wait(600)
    const copyBtn = document.querySelector('button[aria-label="copy LOG_LEVEL"]')
    check('copy button found after reveal', !!copyBtn, copyBtn ? 'yes' : document.querySelector('.card, .pane')?.innerText.slice(0, 120))
    copyBtn?.click()
    await wait(500)
    const copied = await (await fetch('/__selftest/clipboard')).text()
    // never echo the clipboard: it may hold the user's own text
    check('copy puts the value on the mac clipboard', copied === 'warn', copied === 'warn' ? 'matches' : 'differs (not shown)')
    await wait(3500) // the test config sets clipboardClearSeconds: 3
    const after = await (await fetch('/__selftest/clipboard')).text()
    check('clipboard auto-clears after clipboardClearSeconds', after === '', after === '' ? 'empty' : 'not empty (not shown)')

    // the revealed value's filter box (payments-prod-env is still revealed)
    const filter = document.querySelector('input.env-filter')
    const setInput = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (filter) {
      setInput(filter, 'log')
      await wait(200)
      const keys = [...filter.closest('.card, .pane').querySelectorAll('tbody td.env-key')].map((td) => td.innerText.trim())
      check('filter shows only matching keys', keys.length === 1 && keys[0] === 'LOG_LEVEL', keys.join(','))
      setInput(filter, '')
      await wait(100)
    } else check('filter box shown with a revealed value', false, 'no filter box')

    // find bar, opened the way the Find menu does it
    window.berglasUI.run('find')
    await wait(200)
    const fb = document.querySelector('.find-bar input')
    if (fb) {
      setInput(fb, 'LOG_LEVEL') // the key is drawn as "LOG_" <wbr> "LEVEL"
      await wait(300)
      const inKeys = [...(CSS.highlights?.get('find') ?? [])].filter((r) => r.startContainer.parentElement?.closest('td.env-key')).length
      check('find matches a key split at "_"', inKeys >= 1, `${inKeys} in key cells`)
      fb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(100)
    }

    window.berglasUI.run('find')
    await wait(200)
    const bar = document.querySelector('.find-bar')
    check('find bar opens and takes focus', !!bar && document.activeElement === bar.querySelector('input'), bar ? 'open' : 'missing')
    if (bar) {
      setInput(bar.querySelector('input'), 'payments')
      await wait(300)
      const count = bar.querySelector('.find-count').innerText
      check('find counts and paints matches', /^1(\/| of )[1-9]/.test(count) && (CSS.highlights?.get('find')?.size ?? 0) > 0, count)
      // typing on narrows the matches: only the new query stays painted
      setInput(bar.querySelector('input'), 'p')
      await wait(300)
      const wide = CSS.highlights?.get('find')?.size ?? 0
      setInput(bar.querySelector('input'), 'pay')
      await wait(300)
      const painted = [...(CSS.highlights?.get('find') ?? [])].map((r) => r.toString().toLowerCase())
      // find must not keep repainting itself while idle
      let idle = 0
      const mo = new MutationObserver((rs) => (idle += rs.length))
      mo.observe(document.getElementById('root'), { subtree: true, attributes: true, attributeFilter: ['style', 'data-find'] })
      await wait(1500)
      mo.disconnect()
      check('find stays still while idle', idle === 0, `${idle} attribute changes in 1.5 s`)
      // WebKit does not paint highlights inside buttons: matched letters there get their own boxes
      const inButtons = [...(CSS.highlights?.get('find') ?? [])].filter((r) => r.startContainer.parentElement?.closest('button'))
      const marks = [...document.querySelectorAll('[data-find-mark]')]
      const widest = Math.max(0, ...marks.map((m) => m.getBoundingClientRect().width))
      check('matches in buttons get letter-sized marks', inButtons.length === 0 || (marks.length >= inButtons.length && widest < 200), `${inButtons.length} in buttons, ${marks.length} marks, widest ${Math.round(widest)}px`)
      check('a longer query repaints only its own matches', wide > painted.length && painted.length > 0 && painted.every((t) => t === 'pay'), `p: ${wide}, pay: ${painted.length}`)
      bar.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(100)
      check('esc closes find and clears paint', !document.querySelector('.find-bar') && (CSS.highlights?.get('find')?.size ?? 0) === 0, 'closed')
    }

    // zoom, the way the View menu does it: zoomed out far enough, the wide layout
    for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut') // 100 → 90 → 80 → 75 → 67 → 60
    await wait(400)
    const z = document.documentElement.style.zoom
    const side = getComputedStyle(document.querySelector('.layout > .side-col')).display
    check('zoom out reaches 60% and switches to the wide layout', z === '0.6' && side !== 'none' && document.getElementById('root').dataset.width === 'wide' && document.scrollingElement.scrollHeight <= innerHeight + 1, `zoom ${z}, side column ${side}`)
    window.berglasUI.run('zoomReset')
    await wait(300)
    check('actual size resets zoom', document.documentElement.style.zoom === '', document.documentElement.style.zoom || '100%')

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
