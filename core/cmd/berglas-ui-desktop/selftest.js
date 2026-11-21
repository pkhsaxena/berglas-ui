// Run in the desktop web view by BERGLAS_UI_SELFTEST=full (demo store only).
// Checks that the ui loaded and that every kind of api call the ui makes
// reaches the core through the web view, then reports to /__selftest.
;(async () => {
  const checks = []
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail })
    fetch('/__selftest/progress?step=' + encodeURIComponent('done: ' + name)).catch(() => {})
  }
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
  // Waiting for the app instead of the clock. idle() returns once no request
  // the page made is in flight and the page has not changed for `quiet` ms
  // (or after `max` ms, so a stuck page fails its check instead of hanging).
  // The credit line's typing animation doesn't count as a change. Where the
  // app itself waits first (find's 150 ms, the setup guide's 500 ms), the
  // step waits for what it expects with waitFor(); where the clock is the
  // point (the clipboard clear, the reveal timer), it still uses wait().
  let inflight = 0
  let lastChange = performance.now()
  const realFetch = window.fetch.bind(window)
  window.fetch = (...args) => {
    if (String(args[0]).includes('/__selftest')) return realFetch(...args)
    inflight++
    return realFetch(...args).finally(() => {
      inflight--
      lastChange = performance.now()
    })
  }
  let lastWhat = ''
  new MutationObserver((records) => {
    const r = records.find((r) => !(r.target instanceof Element ? r.target : r.target.parentElement)?.closest('.credit-bar'))
    if (!r) return
    lastChange = performance.now()
    const el = r.target instanceof Element ? r.target : r.target.parentElement
    lastWhat = `${r.type}${r.attributeName ? ' ' + r.attributeName : ''} on ${el?.tagName?.toLowerCase() ?? '?'}${el?.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
  const idle = async (quiet = 60, max = 5000) => {
    const start = performance.now()
    await wait(0)
    while (performance.now() - start < max) {
      // quiet since this call, not just since the last change: an action that was just taken may not have rendered yet
      if (inflight === 0 && performance.now() - Math.max(lastChange, start) >= quiet) return true
      await wait(10)
    }
    // loud, so a page that never settles shows up instead of only making the run slow
    fetch('/__selftest/progress?step=' + encodeURIComponent(`idle: never settled in ${max} ms (${inflight} requests in flight; last change: ${lastWhat})`)).catch(() => {})
    return false
  }
  // the condition's value once it is truthy, or its last value after `max` ms
  const waitFor = async (cond, max = 5000) => {
    const start = performance.now()
    for (;;) {
      const v = cond()
      if (v || performance.now() - start >= max) return v
      await wait(10)
    }
  }
  try {
    check('page origin', true, location.href)
    await waitFor(() => document.querySelectorAll('.rowbtn').length > 0, 10000)
    await idle()
    check('ui rendered', document.querySelectorAll('.card, .pane').length > 0, `${document.querySelectorAll('.card, .pane').length} panes, ${document.querySelectorAll('.rowbtn').length} rows, css ${[...document.styleSheets].map((x) => (x.href || '').split('/').pop().split('-')[0]).filter(Boolean).join(',')}`)

    // copy through the real ui, before the api checks below change the demo data:
    // reveal payments-prod-env and press copy on a key. This overwrites the
    // mac clipboard, and the auto-clear then empties it.
    const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase() === text && b.getBoundingClientRect().width)
    document.querySelector('.rowbtn[aria-label="payments-prod-env"]')?.click()
    await idle()
    button('reveal')?.click()
    await idle()
    const copyBtn = document.querySelector('button[aria-label="copy LOG_LEVEL"]')
    check('copy button found after reveal', !!copyBtn, copyBtn ? 'yes' : document.querySelector('.card, .pane')?.innerText.slice(0, 120))
    copyBtn?.click()
    await idle()
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
      await idle()
      const keys = [...filter.closest('.card, .pane').querySelectorAll('tbody td.env-key')].map((td) => td.innerText.trim())
      check('filter shows only matching keys', keys.length === 1 && keys[0] === 'LOG_LEVEL', keys.join(','))
      // whole-file copies: the shown keys as .env lines, and as shell export lines (never echoed)
      button('copy 1 shown')?.click()
      await idle()
      const shownClip = await (await fetch('/__selftest/clipboard')).text()
      check('copy shown keys puts KEY=value lines on the clipboard', shownClip === 'LOG_LEVEL=warn\n', shownClip === 'LOG_LEVEL=warn\n' ? 'matches' : 'differs (not shown)')
      button('copy as export lines')?.click()
      await idle()
      const exportClip = await (await fetch('/__selftest/clipboard')).text()
      check('copy as export lines quotes for a shell', exportClip === "export LOG_LEVEL='warn'\n", exportClip === "export LOG_LEVEL='warn'\n" ? 'matches' : 'differs (not shown)')
      // let its clear run now, so the page is still for the find checks below
      await wait(3500)
      const exportCleared = (await (await fetch('/__selftest/clipboard')).text()) === ''
      check('whole-file copies clear like any copy', exportCleared, exportCleared ? 'empty' : 'not empty (not shown)')
      setInput(filter, '')
      await idle()
    } else check('filter box shown with a revealed value', false, 'no filter box')

    // find bar, opened the way the Find menu does it
    window.berglasUI.run('find')
    const fb = await waitFor(() => document.querySelector('.find-bar input'))
    if (!fb) check('find matches a key split at "_"', false, 'the find bar did not open')
    else {
      setInput(fb, 'LOG_LEVEL') // the key is drawn as "LOG_" <wbr> "LEVEL"
      await idle(250) // find searches 150 ms after typing stops
      const inKeys = [...(CSS.highlights?.get('find') ?? [])].filter((r) => r.startContainer.parentElement?.closest('td.env-key')).length
      check('find matches a key split at "_"', inKeys >= 1, `${inKeys} in key cells`)
      fb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
    }

    window.berglasUI.run('find')
    await idle()
    const bar = document.querySelector('.find-bar')
    check('find bar opens and takes focus', !!bar && document.activeElement === bar.querySelector('input'), bar ? 'open' : 'missing')
    if (bar) {
      setInput(bar.querySelector('input'), 'payments')
      await idle(250) // find searches 150 ms after typing stops
      const count = bar.querySelector('.find-count').innerText
      check('find counts and paints matches', /^1(\/| of )[1-9]/.test(count) && (CSS.highlights?.get('find')?.size ?? 0) > 0, count)
      // typing on narrows the matches: only the new query stays painted
      setInput(bar.querySelector('input'), 'p')
      await idle(250) // find searches 150 ms after typing stops
      const wide = CSS.highlights?.get('find')?.size ?? 0
      setInput(bar.querySelector('input'), 'pay')
      await idle(250) // find searches 150 ms after typing stops
      const painted = [...(CSS.highlights?.get('find') ?? [])].map((r) => r.toString().toLowerCase())
      // find must not keep repainting itself while idle
      let changes = 0
      const mo = new MutationObserver((rs) => (changes += rs.length))
      mo.observe(document.getElementById('root'), { subtree: true, attributes: true, attributeFilter: ['style', 'data-find'] })
      await wait(1500)
      mo.disconnect()
      check('find stays still while idle', changes === 0, `${changes} attribute changes in 1.5 s`)
      // WebKit does not paint highlights inside buttons: matched letters there get their own boxes
      const inButtons = [...(CSS.highlights?.get('find') ?? [])].filter((r) => r.startContainer.parentElement?.closest('button'))
      const marks = [...document.querySelectorAll('[data-find-mark]')]
      const widest = Math.max(0, ...marks.map((m) => m.getBoundingClientRect().width))
      check('matches in buttons get letter-sized marks', inButtons.length === 0 || (marks.length >= inButtons.length && widest < 200), `${inButtons.length} in buttons, ${marks.length} marks, widest ${Math.round(widest)}px`)
      check('a longer query repaints only its own matches', wide > painted.length && painted.length > 0 && painted.every((t) => t === 'pay'), `p: ${wide}, pay: ${painted.length}`)
      bar.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
      check('esc closes find and clears paint', !document.querySelector('.find-bar') && (CSS.highlights?.get('find')?.size ?? 0) === 0, 'closed')
    }

    // zoom, the way the View menu does it: zoomed out far enough, the wide layout
    for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut') // 100 → 90 → 80 → 75 → 67 → 60
    await idle()
    const z = document.documentElement.style.zoom
    const side = getComputedStyle(document.querySelector('.layout > .side-col')).display
    check('zoom out reaches 60% and switches to the wide layout', z === '0.6' && side !== 'none' && document.getElementById('root').dataset.width === 'wide' && document.scrollingElement.scrollHeight <= innerHeight + 1, `zoom ${z}, side column ${side}`)
    window.berglasUI.run('zoomReset')
    await idle()
    check('actual size resets zoom', document.documentElement.style.zoom === '', document.documentElement.style.zoom || '100%')

    // ---- the ui, driven the way a person uses it (FEATURES.md rows) ----
    // Skin-neutral: controls are found by aria-label or visible text, in any
    // case, so the same checks run on every skin. Each step reports on its
    // own, so one failure does not hide the rest.
    const vis = (el) => !!el && el.getBoundingClientRect().width > 0
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const findButton = (names, root = document) =>
      [...root.querySelectorAll('button')].find(
        (b) =>
          vis(b) &&
          names.some((name) => {
            const n = name.toLowerCase()
            const t = norm(b.textContent)
            const a = norm(b.getAttribute('aria-label'))
            return n.endsWith('*') ? t.startsWith(n.slice(0, -1)) || a.startsWith(n.slice(0, -1)) : t === n || a === n
          }),
      )
    const press = async (names, root) => {
      const list = [].concat(names)
      const b = findButton(list, root)
      if (!b) throw new Error(`no button "${list.join('" or "')}"`)
      b.click()
      await idle()
      return b
    }
    const tab = (name) => [...document.querySelectorAll('[role=tab]')].find((b) => vis(b) && norm(b.textContent) === name)
    const openSecret = async (name) => {
      const r = document.querySelector(`.rowbtn[aria-label="${name}"]`)
      if (!r) throw new Error(`no list row ${name}`)
      r.click()
      await idle()
    }
    const field = (label) => document.querySelector(`[aria-label="${label}"]`)
    const setField = (target, v) => {
      const el = typeof target === 'string' ? field(target) : target
      if (!el) throw new Error(`no field "${target}"`)
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const headerSelect = (name) => [...document.querySelectorAll('header label')].find((l) => norm(l.childNodes[0]?.textContent) === name)?.querySelector('[role=combobox]')
    // the skins' searchable dropdown (Select): a combobox button with a popup listbox
    const comboOpen = async (btn) => {
      if (btn.getAttribute('aria-expanded') !== 'true') btn.click()
      await idle()
      return document.getElementById(btn.getAttribute('aria-controls'))
    }
    const optionsOf = async (btn) => {
      const list = await comboOpen(btn)
      const out = [...list.querySelectorAll('[role=option]')].map((o) => ({ value: o.dataset.value, label: norm(o.textContent) }))
      btn.click() // close
      await idle()
      return out
    }
    const choose = async (btn, value) => {
      const list = await comboOpen(btn)
      const o = [...list.querySelectorAll('[role=option]')].find((x) => x.dataset.value === value)
      if (!o) throw new Error(`no option ${value} in ${btn.getAttribute('aria-label')}`)
      o.click()
      await idle()
    }
    const readSecret = async (name) => {
      const r = await call('POST', '/api/secrets/read', ref(name))
      return r.json?.secret?.plaintext ? new TextDecoder().decode(Uint8Array.from(atob(r.json.secret.plaintext), (c) => c.charCodeAt(0))) : null
    }
    // the visible one: wide-layout copies of a pane stay in the page, hidden
    const pane = (cls) => [...document.querySelectorAll(cls)].find(vis) || null
    const cancelIfOpen = async () => {
      const b = findButton(['cancel'])
      if (b) {
        b.click()
        await idle()
      }
    }
    // toasts last under 2 s, so record every one as it appears
    const toasts = new Set()
    const noteToast = () => {
      const t = norm(document.querySelector('.toast')?.textContent)
      if (t) toasts.add(t.split(' ')[0])
    }
    const toastWatch = new MutationObserver(noteToast)
    toastWatch.observe(document.body, { subtree: true, childList: true, characterData: true })
    const step = async (name, fn) => {
      // tell the app which step is running, so a hang names its step
      fetch('/__selftest/progress?step=' + encodeURIComponent(name)).catch(() => {})
      await cancelIfOpen() // a step that failed half-way may have left an editor open
      try {
        const [ok, detail] = await fn()
        check(name, ok, detail)
      } catch (e) {
        check(name, false, String(e?.message || e))
      }
      noteToast()
    }
    const sourceRow = (text) => [...document.querySelectorAll('.sources-pane .rowbtn')].find((b) => norm(b.textContent).includes(text))

    // window
    await step('account line shows demo mode', async () => {
      const t = norm(document.querySelector('header').textContent)
      return [t.includes('demo'), t.slice(0, 80)]
    })
    await step('header controls: time, zoom, theme, skin', async () => {
      const order = [...document.querySelectorAll('header label')].map((l) => norm(l.childNodes[0]?.textContent))
      return [order.join(',') === 'time,zoom,theme,skin', order.join(', ')]
    })
    await step('theme picker applies and saves the theme', async () => {
      const sel = headerSelect('theme')
      const orig = sel.dataset.value
      const bg0 = getComputedStyle(document.body).backgroundColor
      let picked = null
      for (const o of (await optionsOf(sel)).map((x) => x.value).filter((v) => v !== orig)) {
        await choose(headerSelect('theme'), o)
        await idle()
        if (getComputedStyle(document.body).backgroundColor !== bg0) {
          picked = o
          break
        }
      }
      const saved = (await call('GET', '/api/config')).json?.theme
      await choose(headerSelect('theme'), orig)
      await idle()
      return [picked !== null && saved === picked, `picked ${picked}, saved ${saved}, back to ${orig}`]
    })

    // sources
    await step('sources list both demo sources', async () => [!!sourceRow('demo-bucket') && !!sourceRow('demo-project'), [...document.querySelectorAll('.sources-pane .rowbtn')].map((b) => norm(b.textContent)).join(' | ')])
    await step('config path is shown', async () => {
      const t = norm(pane('.sources-pane').textContent)
      return [t.includes('saved in') && (t.includes('.yaml') || t.includes('throwaway demo config')), t.slice(t.indexOf('saved in'), t.indexOf('saved in') + 60)]
    })
    await step('add a source: bad names refused, a good one added and opened', async () => {
      if (!field('bucket name')) await press(['add a source'])
      setField('bucket name', 'bad name')
      await press(['add'])
      const err = norm(pane('.sources-pane').textContent).includes('no spaces')
      setField('bucket name', 'selftest-bucket')
      await press(['add'])
      const row = sourceRow('selftest-bucket')
      return [err && !!row && row.getAttribute('aria-current') === 'true', `error shown ${err}, added ${!!row}, active ${row?.getAttribute('aria-current')}`]
    })
    await step('remove a source: undo puts it back, then it can be removed for good', async () => {
      await press(['remove selftest-bucket'])
      const gone = !sourceRow('selftest-bucket')
      const offered = !!document.querySelector('.undo-bar')
      await press(['undo'], document.querySelector('.undo-bar'))
      const back = !!sourceRow('selftest-bucket') && (await call('GET', '/api/config')).json.sources.some((x) => x.parent === 'selftest-bucket')
      await press(['remove selftest-bucket'])
      await press(['dismiss'], document.querySelector('.undo-bar'))
      const removed = !sourceRow('selftest-bucket') && !document.querySelector('.undo-bar')
      return [gone && offered && back && removed, `removed ${gone}, undo offered ${offered}, undo restored and saved ${back}, removed again ${removed}`]
    })
    await step('setup guide: from ⌘K, several sources pasted at once, bad rows held, group and protected names saved in one write', async () => {
      const cfg0 = (await call('GET', '/api/config')).json
      window.berglasUI.run('setup')
      await idle()
      const dlg = () => document.querySelector('[aria-label="set up berglas-ui"]')
      const opened = !!dlg()
      dlg().querySelector('details.setup-paste').open = true
      await idle()
      setField('paste sources', 'berglas://demo-bucket\nsetup-bucket-a, sm://setup-project-b')
      await press(['add these'], dlg())
      const pasted = norm(dlg().textContent).includes('added 2 · 1 already listed')
      await waitFor(() => norm(dlg().textContent).includes('reachable'), 3000) // each row is checked once typing stops
      const listed = norm(dlg().textContent).includes('reachable')
      setField(dlg().querySelectorAll('input[list="setup-groups"]')[0], 'no-placeholder')
      await idle()
      const nextBtn = () => findButton(['next'], dlg())
      const held = nextBtn()?.disabled === true && norm(dlg().textContent).includes('needs a {placeholder}')
      setField(dlg().querySelectorAll('input[list="setup-groups"]')[0], '{service}-{env}')
      await idle()
      await press(['next'], dlg())
      setField('protected name pattern', 'setup-*')
      await press(['add'], dlg())
      await press(['next'], dlg())
      const review = norm(dlg().textContent)
      const reviewed = review.includes('2 sources to add') && review.includes('setup-bucket-a') && review.includes('grouped by {service}-{env}') && review.includes('setup-*')
      await press(['save and open*'], dlg())
      await idle()
      const cfg = (await call('GET', '/api/config')).json
      const a = cfg.sources.find((x) => x.parent === 'setup-bucket-a')
      const b = cfg.sources.find((x) => x.parent === 'setup-project-b')
      const saved = !dlg() && a?.group === '{service}-{env}' && b?.backend === 'sm' && cfg.protect.includes('setup-*') && !cfg.auditLog
      const opens = sourceRow('setup-bucket-a')?.getAttribute('aria-current') === 'true'
      // put the demo back as it was for the steps after this one
      await press(['remove setup-bucket-a'])
      await press(['remove setup-project-b'])
      await call('POST', '/api/config', { protect: cfg0.protect, lockAfterMinutes: cfg0.lockAfterMinutes ?? 0 })
      return [opened && pasted && listed && held && reviewed && saved && opens, `opened ${opened}, pasted ${pasted}, listed ${listed}, bad group holds next ${held}, review ${reviewed}, saved ${saved}, opened the first ${opens}`]
    })
    await step('pick a source switches the list', async () => {
      sourceRow('demo-project').click()
      await idle()
      const sm = !!document.querySelector('.rowbtn[aria-label="db-password"]')
      sourceRow('demo-bucket').click()
      await idle()
      const bucket = !!document.querySelector('.rowbtn[aria-label="payments-dev-env"]')
      return [sm && bucket, `secret manager list ${sm}, bucket list ${bucket}`]
    })

    // secret list
    await step('filter narrows the list, / focuses it', async () => {
      setField('filter secrets', 'payments')
      await idle()
      const rows = [...document.querySelectorAll('.rowbtn.secret')].filter(vis).map((b) => b.getAttribute('aria-label'))
      setField('filter secrets', '')
      field('filter secrets').blur()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
      await idle()
      const focused = document.activeElement === field('filter secrets')
      document.activeElement.blur()
      return [rows.length === 2 && rows.every((r) => r.includes('payments')) && focused, `${rows.join(', ')}; / focuses: ${focused}`]
    })
    await step('environment colors on list rows', async () => {
      const prod = !!document.querySelector('.rowbtn[aria-label="payments-prod-env"] [class*="tone-prod"]')
      const dev = !!document.querySelector('.rowbtn[aria-label="payments-dev-env"] [class*="tone-dev"]')
      return [prod && dev, `prod ${prod}, dev ${dev}`]
    })
    await step('refresh keeps the list; new opens the create pane', async () => {
      await press(['refresh'])
      await idle()
      const rows = document.querySelectorAll('.rowbtn.secret').length
      await press(['new', 'new secret'])
      const form = vis(field('secret name'))
      await cancelIfOpen()
      return [rows > 0 && form, `${rows} rows after refresh, create form ${form}`]
    })

    // a secret
    await step('secret details: generation, updated, kms key, location', async () => {
      await openSecret('payments-prod-env')
      const t = norm(pane('.secret-pane').textContent)
      const want = ['generation', 'updated', 'kms key', 'berglas://demo-bucket/payments-prod-env']
      return [want.every((w) => t.includes(w)), want.filter((w) => !t.includes(w)).join(', ') || 'all shown']
    })
    await step('production banner on a protected prod secret; a strip on dev', async () => {
      const banner = norm(document.querySelector('.secret-pane .env-banner')?.textContent)
      await openSecret('payments-dev-env')
      const devStrip = !!document.querySelector('.secret-pane .env-strip, .secret-pane .env-rule') && !document.querySelector('.secret-pane .env-banner')
      return [banner.includes('production') && banner.includes('protected') && devStrip, `prod: "${banner}"; dev strip ${devStrip}`]
    })
    await step('version list: three versions, newest first', async () => {
      const rows = [...document.querySelectorAll('.versions-pane tbody tr')].filter(vis)
      const ids = rows.map((r) => Number((r.textContent.match(/\d{10,}/) || ['0'])[0]))
      const sorted = ids.every((v, i) => i === 0 || ids[i - 1] > v)
      return [rows.length === 3 && sorted, ids.join(' > ')]
    })
    await step('view an older version: marked old, restore offered', async () => {
      await press(['view'], pane('.versions-pane'))
      const t = norm(pane('.secret-pane').textContent)
      const restore = !!findButton(['restore this version…'])
      return [(t.includes(' old') || t.includes('older version')) && restore, `old marked ${t.includes(' old') || t.includes('older version')}, restore ${restore}`]
    })
    await step('restore a version opens the editor over the latest', async () => {
      await press(['restore this version…'])
      await idle()
      const t = norm(document.querySelector('.right')?.textContent)
      const ok = t.includes('restoring')
      await cancelIfOpen()
      await openSecret('payments-prod-env')
      await openSecret('payments-dev-env')
      return [ok, ok ? 'editor says restoring' : t.slice(0, 120)]
    })
    await step('a version diff replaces the table; hide diff brings it back', async () => {
      const vp = pane('.versions-pane')
      const flags = [...vp.querySelectorAll('.flag')]
      flags[4].click()
      await idle()
      flags[1].click()
      await idle()
      await press(['diff a → b'], vp)
      await idle()
      const tableHidden = !vis(vp.querySelector('table:not(.diff)'))
      const diff = !!vp.querySelector('table.diff, .diff-lines')
      const head = vp.querySelector('h2, .pane-head')
      const hide = findButton(['hide diff'], head)
      hide?.click()
      await idle()
      const back = vis(vp.querySelector('table:not(.diff)'))
      return [tableHidden && diff && !!hide && back, `table hidden ${tableHidden}, diff ${diff}, hide in header ${!!hide}, table back ${back}`]
    })

    // pin and compare
    await step('pin keeps the value; marks and compare against it', async () => {
      if (findButton(['reveal'])) await press(['reveal'])
      await press(['pin'])
      // no second pane for the secret that is open; it appears once another one is
      const notTwice = !pane('.pinned-pane')
      await openSecret('payments-prod-env')
      const pinned = notTwice && vis(pane('.pinned-pane'))
      if (findButton(['reveal'])) await press(['reveal'])
      const differs = [...document.querySelectorAll('.secret-pane td')].filter((td) => td.textContent.includes('≠')).length
      await press(['compare with pinned*'])
      await idle()
      const diff = !!document.querySelector('.secret-pane table.diff, .secret-pane .diff-lines')
      await press(['hide comparison'])
      return [pinned && differs > 0 && diff, `pinned ${pinned}, ≠ marks ${differs}, comparison ${diff}`]
    })
    await step('comparing layout: the side column steps aside when zoomed out', async () => {
      for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut')
      await idle()
      const layout = document.querySelector('.layout')
      const ok = layout.classList.contains('comparing') && getComputedStyle(document.querySelector('.layout > .side-col')).display === 'none'
      window.berglasUI.run('zoomReset')
      await idle()
      return [ok, `layout "${layout.className}"`]
    })
    await step('edit against the pin: use pinned, add all, typed confirm, save', async () => {
      await press(['edit production…'])
      await idle()
      const before = document.querySelectorAll('.right button').length
      let used = 0
      for (let b = findButton(['use pinned']); b; b = findButton(['use pinned'])) {
        b.click()
        used++
        await idle()
        if (used > 20) break
      }
      // only in pinned: each KEY=value with the key, the = and the value in their own colours
      const onlyPinned = [...document.querySelectorAll('.right .section')].find((x) => norm(x.textContent).startsWith('only in pinned'))
      const missing = [...(onlyPinned?.querySelectorAll('li') ?? [])]
      const coloured =
        missing.length > 0 &&
        missing.every((li) => {
          const [k, eq, v] = li.querySelectorAll('span > span')
          return !!(k && eq && v) && eq.textContent === '=' && getComputedStyle(k).color !== getComputedStyle(v).color && getComputedStyle(eq).color !== getComputedStyle(k).color
        })
      const newBefore = document.querySelectorAll('.right tr.env-new').length
      await press(['add all*'])
      // the added keys are new to this secret, so their rows are marked
      const newRows = [...document.querySelectorAll('.right tr.env-new')]
      const addedMarked = newBefore === 0 && newRows.length === missing.length && newRows.every((r) => norm(r.textContent).includes('new'))
      // and listed last, in the order they were added
      const missingKeys = missing.map((li) => li.querySelector('span > span')?.textContent)
      const lastKeys = [...document.querySelectorAll('.right tbody tr')].slice(-missingKeys.length).map((r) => r.querySelector('input.key-input')?.value)
      const addedLast = missingKeys.length > 0 && JSON.stringify(lastKeys) === JSON.stringify(missingKeys)
      const matches = norm(document.querySelector('.right').textContent).includes('matches pinned')
      await press(['review changes'])
      // not just 'save*': the pinned pane, still on screen, has its own "save to file…"
      const save = findButton(['save to production*'])
      // a protected save unlocks on the word "confirm", not on the secret's name
      setField('type confirm to confirm', 'payments-prod-env')
      await idle()
      const lockedBefore = save?.disabled && findButton(['save to production*']).disabled
      setField('type confirm to confirm', 'confirm')
      await idle()
      const unlocked = !findButton(['save to production*']).disabled
      await press(['save to production*'])
      await idle()
      const v = (await readSecret('payments-prod-env')) || ''
      await press(['unpin'])
      return [used > 0 && coloured && addedMarked && addedLast && matches && lockedBefore && unlocked && v.includes('FEATURE_REFUNDS') && v.includes('WEBHOOK_SECRET'), `used pinned ${used}×, only-in-pinned coloured ${coloured} (${missing.length}), added keys marked new ${addedMarked} (${newRows.length}), listed last ${addedLast}, matches ${matches}, save locked ${lockedBefore} then ${unlocked ? 'unlocked' : 'locked'}, saved keys ${v.includes('FEATURE_REFUNDS')}`]
    })
    await step('pin without revealing; compare shows only the diff; pinned pane like a secret pane', async () => {
      const masked = (sel) => !!pane(sel)?.querySelector('[aria-label="value hidden"]')
      await openSecret('orders-dev-env')
      if (findButton(['hide'])) await press(['hide'])
      await press(['pin'])
      await idle()
      await openSecret('orders-staging-env')
      if (findButton(['hide'], pane('.secret-pane'))) await press(['hide'], pane('.secret-pane'))
      const pinPane = pane('.pinned-pane')
      const pinnedHidden = vis(pinPane) && masked('.pinned-pane')
      const noOpen = !findButton(['open'], pinPane)
      // the pinned pane has the secret pane's fields and actions
      const pinText = norm(pinPane?.textContent)
      const fields = pinText.includes('kms key') && pinText.includes('orders-dev-env')
      const actions = !!findButton(['reveal'], pinPane) && !!findButton(['copy value'], pinPane) && !!findButton(['unpin'], pinPane)
      const stagingHidden = masked('.secret-pane')
      await press(['compare with pinned*'])
      await idle()
      const diff = !!document.querySelector('.secret-pane table.diff, .secret-pane .diff-lines')
      // the compare shows only the diff: both values stay hidden
      const bothHidden = masked('.pinned-pane') && masked('.secret-pane')
      await press(['hide comparison'])
      // the pinned pane's own reveal shows the value and offers the file; hide masks it again
      await press(['reveal'], pane('.pinned-pane'))
      await idle()
      const revealed = !masked('.pinned-pane') && norm(pane('.pinned-pane')?.textContent).includes('api_url')
      const saveOffered = !!findButton(['save to file…'], pane('.pinned-pane'))
      await press(['hide'], pane('.pinned-pane'))
      const rehidden = masked('.pinned-pane')
      await press(['unpin'])
      return [
        pinnedHidden && stagingHidden && noOpen && fields && actions && diff && bothHidden && revealed && saveOffered && rehidden,
        `pinned hidden ${pinnedHidden}, open secret hidden ${stagingHidden}, no open button ${noOpen}, fields ${fields}, actions ${actions}, comparison ${diff}, both still hidden ${bothHidden}, pinned reveal ${revealed}, save offered ${saveOffered}, hide masks again ${rehidden}`,
      ]
    })

    // edit
    await step('edit: change a value, remove a key, add a key into a section, save', async () => {
      await openSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await idle()
      // while the editor is up the other views wait: switching would drop the draft
      const others = ['versions', 'overview', 'matrix', 'drift'].map(tab).filter(Boolean)
      const waits = others.length >= 3 && others.every((b) => b.disabled) && !tab('payments-dev-env')?.disabled && !tab('secret')?.disabled
      setField('value of LOG_LEVEL', 'warn')
      await press(['remove WEBHOOK_SECRET'])
      setField('new key', 'SELFTEST_FLAG')
      setField('new value', '1')
      const sec = field('section for the new key')
      const secOpts = sec ? await optionsOf(sec) : []
      if (secOpts.length > 1) await choose(field('section for the new key'), secOpts[1].value)
      await press(['add key'])
      // the added key leaves its section in the table and is listed last, under New keys
      const rows = [...document.querySelectorAll('.right tbody tr')]
      const addedLast = rows.at(-1)?.querySelector('input.key-input')?.value === 'SELFTEST_FLAG' && norm(rows.at(-2)?.textContent) === (norm(rows.at(-2)?.textContent).startsWith('#') ? '# new keys' : 'new keys')
      await press(['review changes'])
      await press(['save*'])
      await idle()
      const v = (await readSecret('payments-dev-env')) || ''
      const freed = ['versions', 'overview', 'matrix', 'drift'].map(tab).filter(Boolean).every((b) => !b.disabled)
      return [waits && freed && addedLast && v.includes('LOG_LEVEL=warn') && v.includes('SELFTEST_FLAG=1') && !v.includes('WEBHOOK_SECRET'), `other tabs disabled while editing ${waits}, enabled after ${freed}, added key listed last ${addedLast}, keys ${v.split('\n').filter(Boolean).map((l) => l.split('=')[0]).join(',')}`]
    })
    await step('edit: rename a key in place (Enter applies, Esc puts it back, bad and taken names refused), renamed key marked new; nothing saved', async () => {
      await openSecret('payments-dev-env')
      const before = await readSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await idle()
      const keyField = (k) => field(`name of ${k}`)
      const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
      const rowOf = (el) => el?.closest('tr')
      const errorIn = (el) => norm(rowOf(el)?.querySelector('.key-error')?.textContent)
      const editable = !!keyField('LOG_LEVEL') && !rowOf(keyField('LOG_LEVEL')).classList.contains('env-new')

      // Enter applies; the renamed key is new to this secret, so it is marked
      setField(keyField('LOG_LEVEL'), 'LOG_LVL')
      key(keyField('LOG_LEVEL'), 'Enter')
      await idle()
      const renamed = !!keyField('LOG_LVL') && !keyField('LOG_LEVEL')
      const marked = !!rowOf(keyField('LOG_LVL'))?.classList.contains('env-new') && norm(rowOf(keyField('LOG_LVL'))?.textContent).includes('new')

      // Esc puts the name back
      setField(keyField('LOG_LVL'), 'SOMETHING_ELSE')
      key(keyField('LOG_LVL'), 'Escape')
      await idle()
      const escBack = keyField('LOG_LVL')?.value === 'LOG_LVL' && !keyField('SOMETHING_ELSE')

      // a bad name is refused with the reason; leaving the field brings the old name back
      setField(keyField('LOG_LVL'), '1BAD')
      key(keyField('LOG_LVL'), 'Enter')
      await idle()
      const badRefused = keyField('LOG_LVL')?.value === '1BAD' && keyField('LOG_LVL')?.getAttribute('aria-invalid') === 'true' && errorIn(keyField('LOG_LVL')).includes('cannot start with a digit')
      keyField('LOG_LVL').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await idle()
      const blurBack = keyField('LOG_LVL')?.value === 'LOG_LVL'

      // a name another line already sets is refused
      setField(keyField('LOG_LVL'), 'DATABASE_URL')
      key(keyField('LOG_LVL'), 'Enter')
      await idle()
      const takenRefused = errorIn(keyField('LOG_LVL')).includes('already exists') && !!keyField('DATABASE_URL') && !!keyField('LOG_LVL')
      key(keyField('LOG_LVL'), 'Escape')
      await idle()

      // a long value wraps onto more lines instead of being cut off; Enter adds no line break
      const vf = field('value of DATABASE_URL')
      const h1 = vf?.offsetHeight ?? 0
      setField(vf, 'x'.repeat(240) + 'END')
      await idle()
      const wraps = vf.offsetHeight > h1 && vf.scrollHeight <= vf.clientHeight + 1 && vf.scrollWidth <= vf.clientWidth + 1
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      vf.dispatchEvent(enter)
      const noBreak = enter.defaultPrevented && !vf.value.includes('\n')

      // the review shows the rename; cancel, so nothing is written
      await press(['review changes'])
      const review = norm(document.querySelector('.right').textContent)
      const reviewed = review.includes('log_lvl') && review.includes('log_level')
      await press(['cancel'])
      const unchanged = (await readSecret('payments-dev-env')) === before
      const checks = { 'keys editable': editable, 'enter renames': renamed, 'renamed key marked new': marked, 'esc puts it back': escBack, 'bad name refused with reason': badRefused, 'leaving restores the name': blurBack, 'taken name refused': takenRefused, 'long value wraps': wraps, 'enter adds no line break': noBreak, 'review shows the rename': reviewed, 'nothing written': unchanged }
      return [Object.values(checks).every(Boolean), Object.entries(checks).map(([k, v]) => `${k} ${v}`).join(', ')]
    })
    await step('save unchanged: refused as a plain review, then saved on purpose as a new version with the same value', async () => {
      const versions = async () => (await call('GET', '/api/secrets/versions?backend=storage&parent=demo-bucket&name=payments-dev-env')).json?.versions?.length ?? -1
      const before = await versions()
      const value = await readSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await idle()
      await press(['review changes'])
      const refused = norm(document.querySelector('.right').textContent).includes('nothing changed')
      await press(['save unchanged…'])
      await idle()
      const noted = norm(document.querySelector('.right').textContent).includes('saving writes the same value again as a new version')
      await press(['save*'])
      await idle()
      const after = await versions()
      const same = (await readSecret('payments-dev-env')) === value
      return [refused && noted && after === before + 1 && same, `plain review refused ${refused}, note shown ${noted}, versions ${before} → ${after}, value unchanged ${same}`]
    })
    await step('unsaved edits: leaving asks first; keep editing keeps the draft, discard leaves; an unchanged editor just goes', async () => {
      await openSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await idle()
      document.querySelector('.rowbtn[aria-label="orders-dev-env"]').click()
      await idle()
      const quietLeave = !document.querySelector('[aria-label="discard unsaved changes"]') && norm(document.querySelector('.right').textContent).includes('orders-dev-env')
      await openSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await idle()
      setField('value of LOG_LEVEL', 'guarded')
      document.querySelector('.rowbtn[aria-label="orders-dev-env"]').click()
      await idle()
      const dlg = () => document.querySelector('[aria-label="discard unsaved changes"]')
      const asked = !!dlg() && norm(dlg().textContent).includes('payments-dev-env')
      await press(['keep editing'], dlg())
      const kept = !dlg() && field('value of LOG_LEVEL')?.value === 'guarded'
      window.berglasUI.run('palette')
      await idle()
      const pal = document.querySelector('[aria-label="command palette"] input, .palette input')
      if (pal) {
        setField(pal, 'orders-dev-env')
        await idle()
        pal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await idle()
      }
      const askedFromPalette = !!dlg()
      await press(['discard changes'], dlg())
      await idle()
      const left = !dlg() && norm(document.querySelector('.right').textContent).includes('orders-dev-env') && (await readSecret('payments-dev-env'))?.includes('guarded') === false
      await openSecret('payments-dev-env') // the conflict step works on this one
      return [quietLeave && asked && kept && askedFromPalette && left, `unchanged editor leaves quietly ${quietLeave}, asked ${asked}, keep keeps the draft ${kept}, ⌘K asks too ${askedFromPalette}, discard leaves and saves nothing ${left}`]
    })
    await step('side bar: the header button and ⌘B hide and show it, saved; / brings it back', async () => {
      const left = () => document.querySelector('.layout > .left')
      const shown = () => vis(left())
      const mainW = () => document.querySelector('.layout > .main-area').getBoundingClientRect().width
      const saved = async () => (await call('GET', '/api/config')).json?.sidebarCollapsed
      const toggle = () => document.querySelector('header .side-toggle')
      const startW = mainW()
      const atStart = shown() && toggle()?.getAttribute('aria-label') === 'hide side bar' && (await saved()) === false

      // the header button hides it; the main area takes the room; the choice is saved
      toggle().click()
      await idle()
      const hidden = !shown() && mainW() > startW + 100 && toggle()?.getAttribute('aria-label') === 'show side bar' && (await saved()) === true

      // ⌘B (Ctrl+B) shows it again
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }))
      await idle()
      const byKey = shown() && (await saved()) === false

      // the command (⌘K's Hide side bar, the View menu) hides it; / shows it and puts the cursor in the filter
      window.berglasUI.run('sidebar')
      await idle()
      const byCommand = !shown()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))
      await idle()
      const slash = shown() && !!document.activeElement?.closest('.left') && document.activeElement.tagName === 'INPUT' && (await saved()) === false
      document.activeElement?.blur()
      const checks = { 'shown at first': atStart, 'header button hides it, saved': hidden, '⌘B shows it, saved': byKey, 'command hides it': byCommand, '/ shows it and focuses the filter': slash }
      return [Object.values(checks).every(Boolean), Object.entries(checks).map(([k, v]) => `${k} ${v}`).join(', ')]
    })
    await step('shortcuts: ? opens the list (not while typing), Esc closes; ⌘K and the Go menu open it', async () => {
      const sheet = () => document.querySelector('[aria-label="keyboard shortcuts"]')
      const f = field('filter secrets') || document.querySelector('input.list-filter, .secrets-pane input[type=search]')
      if (f) {
        f.focus()
        f.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
        await idle()
      }
      const notWhileTyping = !sheet()
      f?.blur()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
      await idle()
      const opened = !!sheet() && norm(sheet().textContent).includes('go to a secret, source or action')
      sheet()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
      const closed = !sheet()
      window.berglasUI.run('shortcuts')
      await idle()
      const fromMenu = !!sheet()
      await press(['done'], sheet())
      return [notWhileTyping && opened && closed && fromMenu, `not while typing ${notWhileTyping}${f ? '' : ' (no field found)'}, ? opens ${opened}, esc closes ${closed}, menu opens ${fromMenu}`]
    })
    await step('conflict: a newer save meanwhile is refused, not overwritten', async () => {
      await press(['edit', 'edit…'])
      await idle()
      setField('value of LOG_LEVEL', 'error')
      await call('POST', '/api/secrets/update', { ...ref('payments-dev-env'), plaintext: b64('LOG_LEVEL=debug\n') })
      await press(['review changes'])
      await press(['save*'])
      await idle()
      const t = norm(document.querySelector('.right').textContent)
      const offered = !!findButton(['start over from latest', 'start over from the latest'])
      const kept = (await readSecret('payments-dev-env')) === 'LOG_LEVEL=debug\n'
      await cancelIfOpen()
      return [t.includes('not saved') && offered && kept, `refused ${t.includes('not saved')}, start over offered ${offered}, other save kept ${kept}`]
    })

    // create and delete
    await step('create a secret (its environment shows)', async () => {
      await press(['new', 'new secret'])
      setField('secret name', 'selftest-svc-nonprod-env')
      setField('kms key', 'projects/demo-project/locations/global/keyRings/berglas/cryptoKeys/berglas-key')
      setField('secret value', 'A=1\n')
      await press(['review'])
      await press(['create*'])
      await idle()
      const row = document.querySelector('.rowbtn[aria-label="selftest-svc-nonprod-env"]')
      return [!!row && !!row.querySelector('[class*="tone-staging"]'), `in list ${!!row}, staging tone ${!!row?.querySelector('[class*="tone-staging"]')}`]
    })
    await step('review warns about duplicate keys and empty values (nothing saved)', async () => {
      await press(['new', 'new secret'])
      setField('secret name', 'selftest-lint-dev-env')
      setField('kms key', 'projects/demo-project/locations/global/keyRings/berglas/cryptoKeys/berglas-key')
      setField('secret value', 'A=1\nB=\nA=2\nC=3\n')
      await press(['review'])
      const box = pane('.env-warnings')
      const t = norm(box?.textContent)
      const dup = t.includes('a is set 2 times (lines 1, 3)')
      const empty = t.includes('b is empty (line 2)')
      const createOk = findButton(['create*'])?.disabled === false
      await press(['cancel'])
      const notCreated = !document.querySelector('.rowbtn[aria-label="selftest-lint-dev-env"]')
      return [dup && empty && createOk && notCreated, `duplicate ${dup}, empty ${empty}, create still allowed ${createOk}, nothing created ${notCreated}`]
    })
    await step('delete needs confirm typed (the name no longer unlocks it)', async () => {
      await openSecret('selftest-svc-nonprod-env')
      await press(['delete…'])
      const locked = findButton(['delete permanently'])?.disabled
      setField('type confirm to confirm', 'selftest-svc-nonprod-env')
      await idle()
      const nameRefused = findButton(['delete permanently'])?.disabled
      setField('type confirm to confirm', 'Confirm ')
      await idle()
      await press(['delete permanently'])
      await idle()
      const gone = !document.querySelector('.rowbtn[aria-label="selftest-svc-nonprod-env"]')
      return [locked && nameRefused && gone, `locked until typed ${locked}, name refused ${nameRefused}, gone ${gone}`]
    })

    // overview and matrix
    await step('view tabs, matrix colors, sort and open from a cell', async () => {
      await openSecret('payments-dev-env')
      tab('versions').click()
      await idle()
      const versionsOnly = vis(pane('.versions-pane')) && !vis(pane('.secret-pane'))
      tab('overview').click()
      await idle()
      const overview = vis(pane('.overview-pane'))
      tab('matrix').click()
      await idle()
      const matrix = vis(pane('.matrix-pane'))
      const prodHead = [...document.querySelectorAll('.matrix-pane th button')].find((b) => norm(b.textContent).startsWith('prod'))
      const tone = !!prodHead?.querySelector('[class*="tone-prod"]')
      prodHead.click()
      await idle()
      const asc = prodHead.closest('th').getAttribute('aria-sort')
      prodHead.click()
      await idle()
      const desc = prodHead.closest('th').getAttribute('aria-sort')
      prodHead.click()
      await idle()
      document.querySelector('.matrix-pane td button[title="payments-prod-env"]').click()
      await idle()
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-prod-env')
      return [versionsOnly && overview && matrix && tone && asc === 'ascending' && desc === 'descending' && opened, `versions only ${versionsOnly}, overview ${overview}, matrix ${matrix}, prod color ${tone}, sort ${asc} → ${desc}, cell opens ${opened}`]
    })

    await step('drift: a matrix service compares its keys, values never shown', async () => {
      tab('matrix').click()
      await idle()
      // service names are plain text; the row's labelled "compare keys" link opens drift
      const nameIsPlain = ![...document.querySelectorAll('.matrix-pane td:first-child button')].some(vis)
      const ordersRow = [...document.querySelectorAll('.matrix-pane tbody tr')].find((r) => vis(r) && norm(r.cells[0]?.textContent) === 'orders')
      const svc = ordersRow && [...ordersRow.querySelectorAll('button')].find((b) => norm(b.textContent) === 'compare keys')
      if (!svc) throw new Error('no compare keys link on the orders row')
      svc.click()
      await idle()
      const d = pane('.drift-pane')
      const text = norm(d?.textContent)
      const rows = [...(d?.querySelectorAll('table tbody tr') ?? [])].map((r) => norm(r.textContent))
      const row = (k) => rows.find((r) => r.startsWith(k.toLowerCase())) ?? ''
      const missing = row('FEATURE_SPLIT').endsWith('missing')
      const warn = row('QUEUE_URL').includes('prod = staging')
      const quotes = row('TIMEOUT_MS').includes('≈')
      const empty = row('SENTRY_DSN').includes('∅')
      // the demo values for orders; none may reach the page
      const leaked = ['orders.dev.internal', 'sqs://', 'dbg_demo_1', 'sentry.example'].filter((v) => document.body.innerText.includes(v))
      tab('differences').click()
      await idle()
      const diffRows = d.querySelectorAll('table tbody tr').length
      const ordersCheck = [...d.querySelectorAll('thead th')].some((th) => norm(th.textContent) === 'check')
      const devHead = [...d.querySelectorAll('th button')].find((b) => norm(b.textContent).endsWith('dev'))
      devHead?.click()
      await idle()
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('orders-dev-env')
      // payments has no prod warning, so no check column
      tab('drift').click()
      await idle()
      await choose(field('service'), 'payments')
      await press(['compare keys', 'compare again'])
      await idle()
      const p = pane('.drift-pane')
      const paymentsCheck = [...p.querySelectorAll('thead th')].some((th) => norm(th.textContent) === 'check')
      return [
        nameIsPlain && rows.length === 6 && missing && warn && quotes && empty && leaked.length === 0 && diffRows === 6 && opened && ordersCheck && !paymentsCheck,
        `names plain ${nameIsPlain}, ${rows.length} keys (${text.match(/\d+ missing somewhere/)?.[0]}), missing ${missing}, prod = staging ${warn}, quotes ${quotes}, empty ${empty}, leaked [${leaked.join(', ')}], differences ${diffRows}, column opens ${opened}, check column orders ${ordersCheck} / payments ${paymentsCheck}`,
      ]
    })

    await step('drift zoomed out: the side matrix has a Drift toggle (the view tabs are hidden)', async () => {
      for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut')
      await idle()
      const wide = document.getElementById('root').dataset.width === 'wide'
      const tabsHidden = ![...document.querySelectorAll('[role=tab]')].some((t) => vis(t) && norm(t.textContent) === 'drift')
      const toggle = [...document.querySelectorAll('.side-col .matrix-pane button')].find((b) => vis(b) && norm(b.textContent) === 'drift')
      const shown = () => !!document.querySelector('.main-area .drift-pane') && vis(document.querySelector('.main-area .drift-pane'))
      // the drift step above may have left the drift view open; the toggle shows it either way
      const state = () => [toggle?.getAttribute('aria-pressed'), shown()].join(' ')
      const before = state()
      toggle?.click()
      await idle()
      const flipped = state()
      toggle?.click()
      await idle()
      const back = state()
      // each state: pressed exactly when the drift pane fills the main column
      const consistent = [before, flipped, back].every((s) => s === 'true true' || s === 'false false')
      const toggles = consistent && before !== flipped && back === before
      window.berglasUI.run('zoomReset')
      await idle()
      return [wide && tabsHidden && !!toggle && toggles, `wide ${wide}, drift tab hidden ${tabsHidden}, toggle ${!!toggle}, pressed/shown ${before} → ${flipped} → ${back}`]
    })

    await step('command palette: ⌘K and the Go menu open it; jump to a secret, run an action, esc closes', async () => {
      const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
      key(document.body, 'k', { metaKey: true })
      await idle()
      const input = field('go to')
      const opened = !!input && document.activeElement === input
      // no spell check, autocorrect or word suggestions in the field (macOS shows a popup otherwise)
      const noAssist = input.getAttribute('spellcheck') === 'false' && input.getAttribute('autocorrect') === 'off' && input.getAttribute('writingsuggestions') === 'false' && input.spellcheck === false
      setField(input, 'orders staging')
      await idle()
      const first = norm(document.querySelector('[role=option][aria-selected=true]')?.textContent)
      key(input, 'Enter')
      await idle()
      const jumped = norm(document.querySelector('.secret-pane')?.textContent).includes('orders-staging-env') && !field('go to')
      window.berglasUI.run('palette') // the desktop app's Go → Go To… (⌘K)
      await idle()
      const viaMenu = !!field('go to')
      setField(field('go to'), 'show matrix')
      await idle()
      key(field('go to'), 'Enter')
      await idle()
      const action = vis(pane('.matrix-pane'))
      key(document.body, 'k', { ctrlKey: true })
      await idle()
      // the current time zone is not offered (picking it would change nothing)
      setField(field('go to'), 'time:')
      await idle()
      const tzOffered = [...document.querySelectorAll('[role=option]')].map((o) => norm(o.textContent))
      const tz = (await call('GET', '/api/config')).json?.timeZone
      const tzOk = tzOffered.length === 1 && !tzOffered[0].includes(tz === 'utc' ? 'utc' : 'local')
      key(field('go to'), 'Escape')
      await idle()
      const closed = !field('go to')
      return [opened && noAssist && tzOk && first.startsWith('orders-staging-env') && jumped && viaMenu && action && closed, `opens ${opened}, no spell check ${noAssist}, time zone (${tz}) offers [${tzOffered}], top hit "${first}", jumped ${jumped}, menu ${viaMenu}, action ${action}, esc ${closed}`]
    })

    const dropFile = async (parts, name) => {
      const dt = new DataTransfer()
      dt.items.add(new File(parts, name))
      document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      await idle()
      const hint = !!document.querySelector('.drop-overlay')
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      await idle()
      return hint
    }
    await step('drop a file: a centred dialog searches for the secret, new secret pinned on top; each choice opens on its review screen; binary refused; nothing saved', async () => {
      const dialogEl = () => document.querySelector('.drop-dialog')
      const list = () => document.getElementById('drop-choices')
      const options = () => [...list().querySelectorAll('[role=option]')].map((o) => norm(o.textContent))
      const newRow = () => document.querySelector('.drop-dialog .drop-new [role=option]')
      const selected = () => norm(dialogEl().querySelector('[role=option][aria-selected="true"]')?.textContent)
      const search = () => field('search secrets for the dropped file')
      const key = (k, mods = {}) => search().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...mods }))
      const reviewing = () => !!findButton(['save', 'save to production', 'save to *', 'save to production*']) && !!findButton(['back to edit']) && !findButton(['review changes'])
      await openSecret('orders-dev-env')
      const before = await readSecret('orders-dev-env')
      const staging = await readSecret('orders-staging-env')

      // centred in the window, the search focused, the open secret offered first and selected
      const hint = await dropFile(['API_URL=https://dropped.example\nNEW_KEY=1\n'], 'orders-dev.env')
      const r = dialogEl().getBoundingClientRect()
      const centred = Math.abs(r.top + r.height / 2 - window.innerHeight / 2) < 4 && Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 4
      const dialog = norm(dialogEl().textContent)
      const focused = document.activeElement === search()
      const first = options()[0] ?? ''
      const openFirst = first.includes('orders-dev-env') && first.includes('open') && selected() === first

      // the new secret sits pinned between the search box and the list, outside the part that scrolls
      const nr = newRow()
      const pinned =
        !!nr && norm(nr.textContent).includes('new secret orders-dev') && !list().contains(nr) &&
        nr.getBoundingClientRect().top > search().getBoundingClientRect().bottom - 1 &&
        nr.getBoundingClientRect().bottom <= list().getBoundingClientRect().top + 1 &&
        !options().some((o) => o.includes('new secret'))
      list().scrollTop = list().scrollHeight
      await idle()
      const stillShown = vis(newRow()) && newRow().getBoundingClientRect().bottom <= list().getBoundingClientRect().top + 1
      list().scrollTop = 0

      // every row ends in a button that says what it leads to: a review, never a write
      const rowButtons = [...list().querySelectorAll('[role=option]')].every((o) => norm(o.querySelector('button')?.textContent) === 'review changes')
      const newButton = norm(nr?.querySelector('button')?.textContent) === 'review new secret'

      // ↑ from the first secret reaches the new secret; ↓ goes back
      key('ArrowUp')
      await idle()
      const upToNew = newRow()?.getAttribute('aria-selected') === 'true'
      key('ArrowDown')
      await idle()
      const downBack = selected() === first

      // the search narrows the list; the new secret follows what is typed
      setField(search(), 'stag')
      await idle()
      const narrowed = options().length > 0 && options().every((o) => o.includes('stag')) && norm(newRow()?.textContent).includes('new secret stag')
      // a name that exists is not offered as new; Enter on a secret that isn't open opens it on the review screen
      setField(search(), 'orders-staging-env')
      await idle()
      const noDuplicate = !newRow()
      key('Enter')
      await idle()
      const otherOpened = !!document.querySelector('.rowbtn[aria-label="orders-staging-env"][aria-current="true"]')
      const otherReview = reviewing() && norm(document.body.innerText).includes('dropped file orders-dev.env')
      await press(['cancel'])

      // the open secret's Review changes button, straight to its review screen
      await openSecret('orders-dev-env')
      await dropFile(['API_URL=https://dropped.example\nNEW_KEY=1\n'], 'orders-dev.env')
      list().querySelector('[role=option] button').click()
      await idle()
      const buttonReview = reviewing()
      await press(['back to edit'])
      const draft = [...document.querySelectorAll('input, textarea')].some((i) => i.value === 'https://dropped.example')
      await press(['cancel'])

      // the same value as now: the editor says nothing changed instead of a review
      await dropFile([before], 'same.env')
      key('Enter')
      await idle()
      const sameNote = norm(document.body.innerText).includes('same.env is the same as the current value') && !!findButton(['review changes'])
      await press(['cancel'])

      // a bad name is explained where the new secret would be; ⌘Enter picks the new secret wherever the selection is
      await dropFile(['TOKEN=abc\n'], 'billing-staging.env')
      setField(search(), 'has space')
      await idle()
      const badName = !newRow() && norm(dialogEl().querySelector('.drop-new')?.textContent).includes("can't create")
      setField(search(), '')
      await idle()
      const notSelected = newRow()?.getAttribute('aria-selected') !== 'true'
      key('Enter', { metaKey: true })
      await idle()
      // the demo bucket has no KMS key configured, so the form opens first, saying so, with the name and value filled in
      const kmsAsked = field('secret name')?.value === 'billing-staging' && field('secret value')?.value === 'TOKEN=abc\n' && norm(document.body.innerText).includes('kms key must look like')
      setField('kms key', 'projects/demo-project/locations/global/keyRings/demo/cryptoKeys/demo')
      await press(['review'])
      const createReview = notSelected && kmsAsked && !!findButton(['create*']) && !!findButton(['back to edit']) && norm(document.body.innerText).includes('dropped file billing-staging.env')
      await press(['cancel'])

      // no secret matches: the new secret is the selection, so Enter takes it
      await dropFile(['X=1\n'], 'zz.env')
      setField(search(), 'zzz-unused')
      await idle()
      const onlyNew = options().length === 0 && newRow()?.getAttribute('aria-selected') === 'true'
      key('Escape')
      await idle()
      const escClosed = !dialogEl()

      await dropFile([new Uint8Array([0xff, 0x00, 0xfe])], 'blob.bin')
      const refused = norm(dialogEl()?.textContent).includes('not text')
      await press(['ok'])
      const unchanged = (await readSecret('orders-dev-env')) === before && (await readSecret('orders-staging-env')) === staging && (await readSecret('billing-staging')) === null && (await readSecret('zzz-unused')) === null
      const checks = { 'drop hint': hint, centred, '2 keys': dialog.includes('2 keys'), focused, 'open first and selected': openFirst, 'new secret pinned above the list': pinned, 'still shown when the list scrolls': stillShown, 'review changes buttons': rowButtons, 'review new secret button': newButton, '↑ reaches new secret': upToNew, '↓ goes back': downBack, 'search narrows': narrowed, 'exact name not offered as new': noDuplicate, 'other secret opened': otherOpened, 'on review': otherReview, 'button opens review': buttonReview, 'back to edit keeps the draft': draft, 'same value says so': sameNote, 'bad name explained': badName, '⌘enter: new secret on review': createReview, 'no match selects new secret': onlyNew, 'esc closes': escClosed, 'binary refused': refused, 'nothing written': unchanged }
      return [Object.values(checks).every(Boolean), Object.entries(checks).map(([k, v]) => `${k} ${v}`).join(', ')]
    })

    await step('save to file: confirmation first, mode 600, protected needs confirm typed', async () => {
      await openSecret('orders-dev-env')
      await press(['reveal'])
      await press(['save to file…'])
      const warned = norm(document.body.innerText).includes('plain text')
      // the confirmation sits above the revealed keys, so a long list can't push it out of view
      const confirmBox = [...document.querySelectorAll('.section')].find((x) => vis(x) && norm(x.textContent).includes('plain text'))
      const keysTable = [...document.querySelectorAll('.secret-pane table, .secret-pane pre')].find(vis)
      const above = !!confirmBox && !!keysTable && !!(confirmBox.compareDocumentPosition(keysTable) & Node.DOCUMENT_POSITION_FOLLOWING)
      await press(['choose where to save…'])
      await idle()
      const saved = (await call('GET', '/__selftest/saved')).json ?? {}
      const size = new TextEncoder().encode(await readSecret('orders-dev-env')).length
      const ok1 = saved.name === 'orders-dev-env.env' && saved.mode === '600' && saved.size === size
      await openSecret('orders-prod-env')
      await press(['reveal'])
      await press(['save to file…'])
      // unlocks on the word "confirm", not on the secret's name
      setField('type confirm to confirm', 'orders-prod-env')
      await idle()
      const locked = findButton(['choose where to save…'])?.disabled === true
      setField('type confirm to confirm', 'confirm')
      await idle()
      await press(['choose where to save…'])
      await idle()
      const saved2 = (await call('GET', '/__selftest/saved')).json ?? {}
      return [warned && above && ok1 && locked && saved2.name === 'orders-prod-env.env' && saved2.mode === '600', `warned ${warned}, above the keys ${above}, file ${saved.name} mode ${saved.mode} size ${saved.size}/${size}, protected locked ${locked}, then ${saved2.name} mode ${saved2.mode}`]
    })

    await step('act as: switch to a configured service account and back; status follows', async () => {
      const sel = field('act as')
      if (!sel) throw new Error('no act as picker')
      const deployer = (await optionsOf(sel)).find((o) => o.label.includes('deployer'))
      await choose(sel, deployer.value)
      await idle()
      const st = (await call('GET', '/api/status')).json
      const cfg = (await call('GET', '/api/config')).json
      const switched = st?.impersonating === 'deployer@demo-project.iam.gserviceaccount.com' && cfg?.credentials?.impersonateServiceAccount === st?.impersonating
      const listed = document.querySelectorAll('.rowbtn[aria-label]').length > 0
      await choose(field('act as'), (await optionsOf(field('act as')))[0].value)
      await idle()
      const back = !(await call('GET', '/api/status')).json?.impersonating
      return [switched && listed && back, `switched ${switched} (${st?.impersonating}), list reloaded ${listed}, back to you ${back}`]
    })

    await step('lock: hides the window, unlock asks for touch id', async () => {
      const before = Number((await fetch('/__selftest/authed').then((r) => r.text())) || 0)
      window.berglasUI.run('lock') // Go → Lock (⇧⌘L)
      await idle()
      const screen = vis(document.querySelector('.lock-screen'))
      const hidden = getComputedStyle(document.querySelector('header')).visibility === 'hidden'
      await press(['unlock with touch id…'])
      await idle()
      const after = Number((await fetch('/__selftest/authed').then((r) => r.text())) || 0)
      const unlocked = !document.querySelector('.lock-screen') && getComputedStyle(document.querySelector('header')).visibility === 'visible'
      return [screen && hidden && after === before + 1 && unlocked, `lock screen ${screen}, page hidden ${hidden}, touch id asked ${after - before}x, unlocked ${unlocked}`]
    })

    await step('settings: ⌘, opens it; search; an ordinary setting saves at once; safety settings save together after one confirmation', async () => {
      const cfg = async () => (await call('GET', '/api/config')).json
      const dialog = () => document.querySelector('[role="dialog"][aria-label="settings"]')
      const rows = () => [...dialog().querySelectorAll('[data-setting]')].filter(vis).map((r) => r.dataset.setting)
      const input = (setting) => dialog().querySelector(`[data-setting="${setting}"] input`)
      const enter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      const bar = () => dialog().querySelector('.settings-save')
      const start = await cfg()

      // ⌘, opens it (the mac app's Go → Settings… runs the same command), and again closes it
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }))
      const byKey = !!(await waitFor(() => vis(dialog())))
      window.berglasUI.run('settings')
      const closed = !!(await waitFor(() => !dialog()))
      window.berglasUI.run('settings')
      if (!(await waitFor(() => dialog()))) throw new Error('settings did not open again from the Go menu command')
      await idle()
      const all = rows()
      // Find (⌘F, the Find menu) is the screen's own search box while it is open, not the window's find bar
      field('search settings').blur()
      window.berglasUI.run('find')
      await idle()
      const findHere = document.activeElement === field('search settings') && !vis(document.querySelector('.find-bar'))
      const complete = ['skin', 'theme', 'zoom', 'timeZone', 'envOrder', 'readOnly', 'protect', 'lockAfterMinutes', 'revealSeconds', 'clipboardClearSeconds', 'allowScreenCapture', 'auditLog', 'cacheSeconds', 'cacheEntries', 'watchMinutes', 'configFile'].every((k) => all.includes(k))
      // the browser version's settings are left out of the mac app
      const noBrowser = !all.includes('listen') && !all.includes('openBrowser')

      // search keeps only what matches
      setField('search settings', 'clipboard')
      await idle()
      const found = rows()
      setField('search settings', 'no such setting')
      await idle()
      const none = rows().length === 0
      setField('search settings', '')
      await idle()

      // an ordinary setting: saved on enter, no save bar; a letter is refused and not saved
      setField(input('cacheEntries'), '321')
      enter(input('cacheEntries'))
      await idle()
      const atOnce = (await cfg()).cacheEntries === 321 && !bar()
      setField(input('cacheEntries'), 'many')
      enter(input('cacheEntries'))
      await idle()
      const refused = (await cfg()).cacheEntries === 321
      setField(input('cacheEntries'), String(start.cacheEntries))
      enter(input('cacheEntries'))
      await idle()

      // safety settings: nothing is saved while editing; the bar lists both; one confirmation saves both
      field('Read-only').click()
      setField(input('lockAfterMinutes'), '7')
      await idle()
      const mid = await cfg()
      const staged = mid.readOnly === start.readOnly && mid.lockAfterMinutes === start.lockAfterMinutes && bar()?.querySelectorAll('li').length === 2
      // a field that is not a value holds the save back
      setField(input('revealSeconds'), 'soon')
      await idle()
      const held = !!findButton(['save safety settings…'], dialog())?.disabled
      setField(input('revealSeconds'), String(start.revealSeconds))
      await idle()
      await press(['save safety settings…'], dialog())
      const asked = !!findButton(['confirm'], dialog()) && (await cfg()).readOnly === start.readOnly
      await press(['confirm'], dialog())
      await idle()
      const after = await cfg()
      const savedBoth = after.readOnly === true && after.lockAfterMinutes === 7 && !bar()
      // read-only is in force at once: the core refuses a write
      const write = await call('POST', '/api/secrets/update', { ...ref('search-api-key'), plaintext: btoa('x') })
      const enforced = write.status === 403

      // back to how it was, the same way
      field('Read-only').click()
      setField(input('lockAfterMinutes'), String(start.lockAfterMinutes))
      await idle()
      await press(['save safety settings…'], dialog())
      await press(['confirm'], dialog())
      await idle()
      const back = await cfg()
      const restored = back.readOnly === start.readOnly && back.lockAfterMinutes === start.lockAfterMinutes

      // closing with an unsaved safety edit asks first; discarding saves nothing
      await waitFor(() => !bar()) // the restore above has finished saving
      field('Read-only').click()
      await waitFor(() => bar()) // the edit is staged
      window.berglasUI.run('settings')
      const asks = !!(await waitFor(() => vis(dialog()) && findButton(['discard and close'], dialog())))
      if (asks) await press(['discard and close'], dialog())
      const gone = !dialog() && (await cfg()).readOnly === start.readOnly
      return [
        byKey && closed && complete && noBrowser && findHere && found.length === 1 && found[0] === 'clipboardClearSeconds' && none && atOnce && refused && staged && held && asked && savedBoth && enforced && restored && asks && gone,
        `⌘, opens ${byKey}, again closes ${closed}, every setting listed ${complete}, browser section left out ${noBrowser}, find goes to its search ${findHere}, search [${found}] none ${none}, saved at once ${atOnce}, letter refused ${refused}, staged ${staged}, bad field holds save ${held}, asks once ${asked}, saved both ${savedBoth}, write refused ${enforced} (${write.status}), restored ${restored}, close asks ${asks}, discarded ${gone}`,
      ]
    })
    await step('dropdown: substring search, arrow keys, enter picks, esc closes', async () => {
      const zoom = headerSelect('zoom')
      const before = zoom.dataset.value
      await comboOpen(zoom)
      const search = document.querySelector('[aria-label="search zoom"]')
      const focused = document.activeElement === search
      // the popup is fixed-positioned: it must sit just under its button and inside the window
      const align = () => {
        const b = headerSelect('zoom').getBoundingClientRect()
        const p = document.querySelector('.combo-pop').getBoundingClientRect()
        return p.top - b.bottom >= 0 && p.top - b.bottom <= 10 && p.right <= innerWidth + 1 && p.left >= -1
      }
      const aligned = align()
      setField(search, '15')
      await idle()
      const list = document.getElementById(zoom.getAttribute('aria-controls'))
      const found = [...list.querySelectorAll('[role=option]')].map((o) => o.dataset.value)
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await idle()
      const picked = headerSelect('zoom').dataset.value
      await comboOpen(headerSelect('zoom'))
      document.querySelector('[aria-label="search zoom"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
      const closed = !document.querySelector('[aria-label="search zoom"]')
      window.berglasUI.run('zoomReset')
      await idle()
      // and under the css zoom, where a fixed box's offsets are scaled
      window.berglasUI.run('zoomOut')
      window.berglasUI.run('zoomOut')
      await idle()
      await comboOpen(headerSelect('zoom'))
      const alignedZoomed = align()
      headerSelect('zoom').click()
      window.berglasUI.run('zoomReset')
      await idle()
      return [
        focused && aligned && alignedZoomed && found.join(',') === '150' && picked === '150' && closed && headerSelect('zoom').dataset.value === '100',
        `search focused ${focused}, under its button ${aligned} (zoomed ${alignedZoomed}), "15" → [${found}], enter picked ${picked} (was ${before}), esc closes ${closed}`,
      ]
    })

    await step('favourites and recents: star, list sections, ⌘K order, saved', async () => {
      await openSecret('orders-dev-env')
      await openSecret('orders-staging-env')
      await press(['add to favourites'])
      await idle()
      const cfg = (await call('GET', '/api/config')).json
      const saved = cfg?.favorites?.some((f) => f.name === 'orders-staging-env') && cfg?.recent?.[0]?.name === 'orders-staging-env' && cfg?.recent?.[1]?.name === 'orders-dev-env'
      const q = pane('.quick-list')
      const qt = norm(q?.textContent)
      const sections = !!q && qt.includes('orders-staging-env') && qt.includes('orders-dev-env')
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      await idle()
      const groups = [...document.querySelectorAll('.palette-group')].map((g) => norm(g.textContent))
      const firstHit = norm(document.querySelector('[role=option]')?.textContent)
      field('go to')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await idle()
      await press(['remove from favourites'])
      await idle()
      const removed = !(await call('GET', '/api/config')).json?.favorites?.some((f) => f.name === 'orders-staging-env')
      return [saved && sections && groups[0] === 'favourites' && firstHit.startsWith('orders-staging-env') && removed, `saved ${saved}, list sections ${sections}, palette groups [${groups.slice(0, 3)}], first ${firstHit.slice(0, 20)}, unstarred ${removed}`]
    })

    await step('recent list: remove an entry, fold and unfold, both saved', async () => {
      await openSecret('orders-dev-env')
      await openSecret('tls-cert')
      const removeBtn = document.querySelector('[aria-label="remove orders-dev-env from recent"]')
      if (!removeBtn) throw new Error('no remove button on the recent row')
      removeBtn.click()
      await idle()
      const cfg = (await call('GET', '/api/config')).json
      const removed = !cfg?.recent?.some((r) => r.name === 'orders-dev-env') && !document.querySelector('[aria-label="remove orders-dev-env from recent"]')
      const toggle = pane('.quick-toggle')
      toggle.click()
      await idle()
      const folded = toggle.getAttribute('aria-expanded') === 'false' && !document.querySelector('[aria-label="remove tls-cert from recent"]') && (await call('GET', '/api/config')).json?.recentCollapsed === true
      pane('.quick-toggle').click()
      await idle()
      const unfolded = !!document.querySelector('[aria-label="remove tls-cert from recent"]') && (await call('GET', '/api/config')).json?.recentCollapsed === false
      return [removed && folded && unfolded, `removed and saved ${removed}, folded and saved ${folded}, unfolded and saved ${unfolded}`]
    })

    await step('deep links: open a secret, ask before adding a source, ignore bad links, copy link', async () => {
      const link = (u) => fetch('/__selftest/link?u=' + encodeURIComponent(u))
      await link('berglas-ui://open?backend=storage&parent=demo-bucket&name=payments-dev-env')
      await idle()
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-dev-env')
      await link('berglas-ui://open?backend=s3&parent=demo-bucket&name=tls-cert')
      await idle()
      const ignored = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-dev-env')
      await link('berglas-ui://open?backend=storage&parent=someone-elses-bucket&name=x-env')
      await idle()
      const asked = !!document.querySelector('[role=dialog][aria-label="open link"]')
      await press(['cancel'])
      const notAdded = !sourceRow('someone-elses-bucket') && !document.querySelector('[role=dialog][aria-label="open link"]')
      await press(['copy link', 'link'])
      await idle()
      const clip = await (await fetch('/__selftest/clipboard')).text()
      const copied = clip === 'berglas-ui://open?backend=storage&parent=demo-bucket&name=payments-dev-env'
      await wait(3500) // a link is cleared after clipboardClearSeconds like every copy
      const cleared = (await (await fetch('/__selftest/clipboard')).text()) === ''
      return [opened && ignored && asked && notAdded && copied && cleared, `opened ${opened}, bad link ignored ${ignored}, unknown source asked ${asked}, not added ${notAdded}, link copied ${copied}, then cleared ${cleared}`]
    })

    await step('watch: someone else\'s write is reported and notified; opening clears it', async () => {
      await openSecret('orders-dev-env')
      await press(['watch'])
      await idle()
      const watching = (await call('GET', '/api/config')).json?.watch?.some((w) => w.name === 'orders-dev-env')
      await call('POST', '/api/watch/check', {}) // first look only records the version
      await openSecret('orders-staging-env')
      await fetch('/__selftest/external-write?name=orders-dev-env')
      const found = (await call('POST', '/api/watch/check', {})).json?.found ?? []
      await idle()
      const notified = (await (await fetch('/__selftest/notified')).text()).includes('orders-dev-env has a new version')
      const row = [...document.querySelectorAll('.quick-list button')].find((b) => vis(b) && norm(b.getAttribute('aria-label')).includes('orders-dev-env (changed)'))
      row?.click()
      await idle()
      const cleared = !((await call('GET', '/api/watch')).json?.changes ?? []).some((c) => c.name === 'orders-dev-env')
      await press(['watching'])
      await idle()
      const unwatched = !(await call('GET', '/api/config')).json?.watch?.some((w) => w.name === 'orders-dev-env')
      return [watching && found.length === 1 && notified && !!row && cleared && unwatched, `watching ${watching}, found ${found.length}, notified ${notified}, changed row ${!!row}, cleared on open ${cleared}, unwatched ${unwatched}`]
    })

    toastWatch.disconnect()
    check('toasts after save, create, delete and pin', ['saved', 'created', 'deleted', 'pinned'].every((t) => toasts.has(t)), [...toasts].join(', '))

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
    // the terminal skin types its credit line out and rotates it, so the link
    // may be missing for a moment: wait for it (a rotation is 20 s)
    let mail = null
    for (let i = 0; i < 120 && !(mail = document.querySelector('a[href^="mailto:"]')); i++) await idle()
    mail?.click()
    await idle()
    const opened = await (await fetch('/__selftest/opened')).text()
    check('mailto link handed to the system, app stays', !!mail && opened.startsWith('mailto:') && location.href === before, `link ${!!mail}, opened ${JSON.stringify(opened)}, page ${location.href}`)
    await wait(3000) // time for a port check from outside
  } catch (e) {
    check('exception', false, String(e) + ' @ ' + String(e?.stack ?? '').split('\n').slice(0, 8).join(' | '))
  }
  const ok = checks.every((c) => c.ok)
  await fetch('/__selftest?ok=' + (ok ? 1 : 0), { method: 'POST', body: JSON.stringify(checks) })
})()
