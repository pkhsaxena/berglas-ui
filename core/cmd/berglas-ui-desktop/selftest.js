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
      await wait(500)
      return b
    }
    const tab = (name) => [...document.querySelectorAll('[role=tab]')].find((b) => vis(b) && norm(b.textContent) === name)
    const openSecret = async (name) => {
      const r = document.querySelector(`.rowbtn[aria-label="${name}"]`)
      if (!r) throw new Error(`no list row ${name}`)
      r.click()
      await wait(800)
    }
    const field = (label) => document.querySelector(`[aria-label="${label}"]`)
    const setField = (target, v) => {
      const el = typeof target === 'string' ? field(target) : target
      if (!el) throw new Error(`no field "${target}"`)
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const headerSelect = (name) => [...document.querySelectorAll('header label')].find((l) => norm(l.childNodes[0]?.textContent) === name)?.querySelector('select')
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
        await wait(400)
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
      const orig = sel.value
      const bg0 = getComputedStyle(document.body).backgroundColor
      let picked = null
      for (const o of [...sel.options].map((x) => x.value).filter((v) => v !== orig)) {
        setField(sel, o)
        await wait(400)
        if (getComputedStyle(document.body).backgroundColor !== bg0) {
          picked = o
          break
        }
      }
      const saved = (await call('GET', '/api/config')).json?.theme
      setField(headerSelect('theme'), orig)
      await wait(400)
      return [picked !== null && saved === picked, `picked ${picked}, saved ${saved}, back to ${orig}`]
    })

    // sources
    await step('sources list both demo sources', async () => [!!sourceRow('demo-bucket') && !!sourceRow('demo-project'), [...document.querySelectorAll('.sources-pane .rowbtn')].map((b) => norm(b.textContent)).join(' | ')])
    await step('config path is shown', async () => {
      const t = norm(pane('.sources-pane').textContent)
      return [t.includes('saved in') && t.includes('.yaml'), t.slice(t.indexOf('saved in'), t.indexOf('saved in') + 60)]
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
    await step('remove a source', async () => {
      await press(['remove selftest-bucket'])
      return [!sourceRow('selftest-bucket'), 'removed']
    })
    await step('pick a source switches the list', async () => {
      sourceRow('demo-project').click()
      await wait(900)
      const sm = !!document.querySelector('.rowbtn[aria-label="db-password"]')
      sourceRow('demo-bucket').click()
      await wait(900)
      const bucket = !!document.querySelector('.rowbtn[aria-label="payments-dev-env"]')
      return [sm && bucket, `secret manager list ${sm}, bucket list ${bucket}`]
    })

    // secret list
    await step('filter narrows the list, / focuses it', async () => {
      setField('filter secrets', 'payments')
      await wait(300)
      const rows = [...document.querySelectorAll('.rowbtn.secret')].filter(vis).map((b) => b.getAttribute('aria-label'))
      setField('filter secrets', '')
      field('filter secrets').blur()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
      await wait(100)
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
      await wait(400)
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
      await wait(400)
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
      await wait(50)
      flags[1].click()
      await wait(100)
      await press(['diff a → b'], vp)
      await wait(300)
      const tableHidden = !vis(vp.querySelector('table:not(.diff)'))
      const diff = !!vp.querySelector('table.diff, .diff-lines')
      const head = vp.querySelector('h2, .pane-head')
      const hide = findButton(['hide diff'], head)
      hide?.click()
      await wait(400)
      const back = vis(vp.querySelector('table:not(.diff)'))
      return [tableHidden && diff && !!hide && back, `table hidden ${tableHidden}, diff ${diff}, hide in header ${!!hide}, table back ${back}`]
    })

    // pin and compare
    await step('pin keeps the value; marks and compare against it', async () => {
      if (findButton(['reveal'])) await press(['reveal'])
      await press(['pin'])
      const pinned = vis(pane('.pinned-pane'))
      await openSecret('payments-prod-env')
      if (findButton(['reveal'])) await press(['reveal'])
      const differs = [...document.querySelectorAll('.secret-pane td')].filter((td) => td.textContent.includes('≠')).length
      await press(['compare with pinned*'])
      await wait(400)
      const diff = !!document.querySelector('.secret-pane table.diff, .secret-pane .diff-lines')
      await press(['hide comparison'])
      return [pinned && differs > 0 && diff, `pinned ${pinned}, ≠ marks ${differs}, comparison ${diff}`]
    })
    await step('comparing layout: the side column steps aside when zoomed out', async () => {
      for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut')
      await wait(500)
      const layout = document.querySelector('.layout')
      const ok = layout.classList.contains('comparing') && getComputedStyle(document.querySelector('.layout > .side-col')).display === 'none'
      window.berglasUI.run('zoomReset')
      await wait(400)
      return [ok, `layout "${layout.className}"`]
    })
    await step('edit against the pin: use pinned, add all, typed name, save', async () => {
      await press(['edit production…'])
      await wait(400)
      const before = document.querySelectorAll('.right button').length
      let used = 0
      for (let b = findButton(['use pinned']); b; b = findButton(['use pinned'])) {
        b.click()
        used++
        await wait(150)
        if (used > 20) break
      }
      await press(['add all*'])
      const matches = norm(document.querySelector('.right').textContent).includes('matches pinned')
      await press(['review changes'])
      const save = findButton(['save*'])
      const lockedBefore = save?.disabled
      setField('type payments-prod-env to confirm', 'payments-prod-env')
      await wait(150)
      const unlocked = !findButton(['save*']).disabled
      await press(['save*'])
      await wait(500)
      const v = (await readSecret('payments-prod-env')) || ''
      await press(['unpin'])
      return [used > 0 && matches && lockedBefore && unlocked && v.includes('FEATURE_REFUNDS') && v.includes('WEBHOOK_SECRET'), `used pinned ${used}×, matches ${matches}, save locked ${lockedBefore} then ${unlocked ? 'unlocked' : 'locked'}, saved keys ${v.includes('FEATURE_REFUNDS')}`]
    })

    // edit
    await step('edit: change a value, remove a key, add a key into a section, save', async () => {
      await openSecret('payments-dev-env')
      await press(['edit', 'edit…'])
      await wait(400)
      setField('value of LOG_LEVEL', 'warn')
      await press(['remove WEBHOOK_SECRET'])
      setField('new key', 'SELFTEST_FLAG')
      setField('new value', '1')
      const sec = field('section for the new key')
      if (sec && sec.options.length > 1) setField(sec, sec.options[1].value)
      await press(['add key'])
      await press(['review changes'])
      await press(['save*'])
      await wait(600)
      const v = (await readSecret('payments-dev-env')) || ''
      return [v.includes('LOG_LEVEL=warn') && v.includes('SELFTEST_FLAG=1') && !v.includes('WEBHOOK_SECRET'), v.split('\n').filter(Boolean).map((l) => l.split('=')[0]).join(',')]
    })
    await step('conflict: a newer save meanwhile is refused, not overwritten', async () => {
      await press(['edit', 'edit…'])
      await wait(400)
      setField('value of LOG_LEVEL', 'error')
      await call('POST', '/api/secrets/update', { ...ref('payments-dev-env'), plaintext: b64('LOG_LEVEL=debug\n') })
      await press(['review changes'])
      await press(['save*'])
      await wait(500)
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
      await wait(600)
      const row = document.querySelector('.rowbtn[aria-label="selftest-svc-nonprod-env"]')
      return [!!row && !!row.querySelector('[class*="tone-staging"]'), `in list ${!!row}, staging tone ${!!row?.querySelector('[class*="tone-staging"]')}`]
    })
    await step('delete needs the name typed', async () => {
      await openSecret('selftest-svc-nonprod-env')
      await press(['delete…'])
      const locked = findButton(['delete permanently'])?.disabled
      setField('type selftest-svc-nonprod-env to confirm', 'selftest-svc-nonprod-env')
      await wait(150)
      await press(['delete permanently'])
      await wait(600)
      const gone = !document.querySelector('.rowbtn[aria-label="selftest-svc-nonprod-env"]')
      return [locked && gone, `locked until typed ${locked}, gone ${gone}`]
    })

    // overview and matrix
    await step('view tabs, matrix colors, sort and open from a cell', async () => {
      await openSecret('payments-dev-env')
      tab('versions').click()
      await wait(300)
      const versionsOnly = vis(pane('.versions-pane')) && !vis(pane('.secret-pane'))
      tab('overview').click()
      await wait(300)
      const overview = vis(pane('.overview-pane'))
      tab('matrix').click()
      await wait(300)
      const matrix = vis(pane('.matrix-pane'))
      const prodHead = [...document.querySelectorAll('.matrix-pane th button')].find((b) => norm(b.textContent).startsWith('prod'))
      const tone = !!prodHead?.querySelector('[class*="tone-prod"]')
      prodHead.click()
      await wait(200)
      const asc = prodHead.closest('th').getAttribute('aria-sort')
      prodHead.click()
      await wait(200)
      const desc = prodHead.closest('th').getAttribute('aria-sort')
      prodHead.click()
      await wait(200)
      document.querySelector('.matrix-pane td button[title="payments-prod-env"]').click()
      await wait(800)
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-prod-env')
      return [versionsOnly && overview && matrix && tone && asc === 'ascending' && desc === 'descending' && opened, `versions only ${versionsOnly}, overview ${overview}, matrix ${matrix}, prod color ${tone}, sort ${asc} → ${desc}, cell opens ${opened}`]
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
