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
    const headerSelect = (name) => [...document.querySelectorAll('header label')].find((l) => norm(l.childNodes[0]?.textContent) === name)?.querySelector('[role=combobox]')
    // the skins' searchable dropdown (Select): a combobox button with a popup listbox
    const comboOpen = async (btn) => {
      if (btn.getAttribute('aria-expanded') !== 'true') btn.click()
      await wait(150)
      return document.getElementById(btn.getAttribute('aria-controls'))
    }
    const optionsOf = async (btn) => {
      const list = await comboOpen(btn)
      const out = [...list.querySelectorAll('[role=option]')].map((o) => ({ value: o.dataset.value, label: norm(o.textContent) }))
      btn.click() // close
      await wait(100)
      return out
    }
    const choose = async (btn, value) => {
      const list = await comboOpen(btn)
      const o = [...list.querySelectorAll('[role=option]')].find((x) => x.dataset.value === value)
      if (!o) throw new Error(`no option ${value} in ${btn.getAttribute('aria-label')}`)
      o.click()
      await wait(150)
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
        await wait(400)
        if (getComputedStyle(document.body).backgroundColor !== bg0) {
          picked = o
          break
        }
      }
      const saved = (await call('GET', '/api/config')).json?.theme
      await choose(headerSelect('theme'), orig)
      await wait(400)
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
      // no second pane for the secret that is open; it appears once another one is
      const notTwice = !pane('.pinned-pane')
      await openSecret('payments-prod-env')
      const pinned = notTwice && vis(pane('.pinned-pane'))
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
    await step('edit against the pin: use pinned, add all, typed confirm, save', async () => {
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
      // not just 'save*': the pinned pane, still on screen, has its own "save to file…"
      const save = findButton(['save to production*'])
      // a protected save unlocks on the word "confirm", not on the secret's name
      setField('type confirm to confirm', 'payments-prod-env')
      await wait(150)
      const lockedBefore = save?.disabled && findButton(['save to production*']).disabled
      setField('type confirm to confirm', 'confirm')
      await wait(150)
      const unlocked = !findButton(['save to production*']).disabled
      await press(['save to production*'])
      await wait(500)
      const v = (await readSecret('payments-prod-env')) || ''
      await press(['unpin'])
      return [used > 0 && matches && lockedBefore && unlocked && v.includes('FEATURE_REFUNDS') && v.includes('WEBHOOK_SECRET'), `used pinned ${used}×, matches ${matches}, save locked ${lockedBefore} then ${unlocked ? 'unlocked' : 'locked'}, saved keys ${v.includes('FEATURE_REFUNDS')}`]
    })
    await step('pin without revealing; compare shows only the diff; pinned pane like a secret pane', async () => {
      const masked = (sel) => !!pane(sel)?.querySelector('[aria-label="value hidden"]')
      await openSecret('orders-dev-env')
      if (findButton(['hide'])) await press(['hide'])
      await press(['pin'])
      await wait(200)
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
      await wait(800)
      const diff = !!document.querySelector('.secret-pane table.diff, .secret-pane .diff-lines')
      // the compare shows only the diff: both values stay hidden
      const bothHidden = masked('.pinned-pane') && masked('.secret-pane')
      await press(['hide comparison'])
      // the pinned pane's own reveal shows the value and offers the file; hide masks it again
      await press(['reveal'], pane('.pinned-pane'))
      await wait(500)
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
      await wait(400)
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
      await press(['review changes'])
      await press(['save*'])
      await wait(600)
      const v = (await readSecret('payments-dev-env')) || ''
      const freed = ['versions', 'overview', 'matrix', 'drift'].map(tab).filter(Boolean).every((b) => !b.disabled)
      return [waits && freed && v.includes('LOG_LEVEL=warn') && v.includes('SELFTEST_FLAG=1') && !v.includes('WEBHOOK_SECRET'), `other tabs disabled while editing ${waits}, enabled after ${freed}, keys ${v.split('\n').filter(Boolean).map((l) => l.split('=')[0]).join(',')}`]
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

    await step('drift: a matrix service compares its keys, values never shown', async () => {
      tab('matrix').click()
      await wait(300)
      // service names are plain text; the row's labelled "compare keys" link opens drift
      const nameIsPlain = ![...document.querySelectorAll('.matrix-pane td:first-child button')].some(vis)
      const ordersRow = [...document.querySelectorAll('.matrix-pane tbody tr')].find((r) => vis(r) && norm(r.cells[0]?.textContent) === 'orders')
      const svc = ordersRow && [...ordersRow.querySelectorAll('button')].find((b) => norm(b.textContent) === 'compare keys')
      if (!svc) throw new Error('no compare keys link on the orders row')
      svc.click()
      await wait(1200)
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
      await wait(200)
      const diffRows = d.querySelectorAll('table tbody tr').length
      const ordersCheck = [...d.querySelectorAll('thead th')].some((th) => norm(th.textContent) === 'check')
      const devHead = [...d.querySelectorAll('th button')].find((b) => norm(b.textContent).endsWith('dev'))
      devHead?.click()
      await wait(800)
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('orders-dev-env')
      // payments has no prod warning, so no check column
      tab('drift').click()
      await wait(300)
      await choose(field('service'), 'payments')
      await press(['compare keys', 'compare again'])
      await wait(1000)
      const p = pane('.drift-pane')
      const paymentsCheck = [...p.querySelectorAll('thead th')].some((th) => norm(th.textContent) === 'check')
      return [
        nameIsPlain && rows.length === 6 && missing && warn && quotes && empty && leaked.length === 0 && diffRows === 6 && opened && ordersCheck && !paymentsCheck,
        `names plain ${nameIsPlain}, ${rows.length} keys (${text.match(/\d+ missing somewhere/)?.[0]}), missing ${missing}, prod = staging ${warn}, quotes ${quotes}, empty ${empty}, leaked [${leaked.join(', ')}], differences ${diffRows}, column opens ${opened}, check column orders ${ordersCheck} / payments ${paymentsCheck}`,
      ]
    })

    await step('drift zoomed out: the side matrix has a Drift toggle (the view tabs are hidden)', async () => {
      for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut')
      await wait(500)
      const wide = document.getElementById('root').dataset.width === 'wide'
      const tabsHidden = ![...document.querySelectorAll('[role=tab]')].some((t) => vis(t) && norm(t.textContent) === 'drift')
      const toggle = [...document.querySelectorAll('.side-col .matrix-pane button')].find((b) => vis(b) && norm(b.textContent) === 'drift')
      const shown = () => !!document.querySelector('.main-area .drift-pane') && vis(document.querySelector('.main-area .drift-pane'))
      // the drift step above may have left the drift view open; the toggle shows it either way
      const state = () => [toggle?.getAttribute('aria-pressed'), shown()].join(' ')
      const before = state()
      toggle?.click()
      await wait(400)
      const flipped = state()
      toggle?.click()
      await wait(400)
      const back = state()
      // each state: pressed exactly when the drift pane fills the main column
      const consistent = [before, flipped, back].every((s) => s === 'true true' || s === 'false false')
      const toggles = consistent && before !== flipped && back === before
      window.berglasUI.run('zoomReset')
      await wait(400)
      return [wide && tabsHidden && !!toggle && toggles, `wide ${wide}, drift tab hidden ${tabsHidden}, toggle ${!!toggle}, pressed/shown ${before} → ${flipped} → ${back}`]
    })

    await step('command palette: ⌘K and the Go menu open it; jump to a secret, run an action, esc closes', async () => {
      const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
      key(document.body, 'k', { metaKey: true })
      await wait(300)
      const input = field('go to')
      const opened = !!input && document.activeElement === input
      // no spell check, autocorrect or word suggestions in the field (macOS shows a popup otherwise)
      const noAssist = input.getAttribute('spellcheck') === 'false' && input.getAttribute('autocorrect') === 'off' && input.getAttribute('writingsuggestions') === 'false' && input.spellcheck === false
      setField(input, 'orders staging')
      await wait(200)
      const first = norm(document.querySelector('[role=option][aria-selected=true]')?.textContent)
      key(input, 'Enter')
      await wait(800)
      const jumped = norm(document.querySelector('.secret-pane')?.textContent).includes('orders-staging-env') && !field('go to')
      window.berglasUI.run('palette') // the desktop app's Go → Go To… (⌘K)
      await wait(300)
      const viaMenu = !!field('go to')
      setField(field('go to'), 'show matrix')
      await wait(200)
      key(field('go to'), 'Enter')
      await wait(500)
      const action = vis(pane('.matrix-pane'))
      key(document.body, 'k', { ctrlKey: true })
      await wait(300)
      // the current time zone is not offered (picking it would change nothing)
      setField(field('go to'), 'time:')
      await wait(200)
      const tzOffered = [...document.querySelectorAll('[role=option]')].map((o) => norm(o.textContent))
      const tz = (await call('GET', '/api/config')).json?.timeZone
      const tzOk = tzOffered.length === 1 && !tzOffered[0].includes(tz === 'utc' ? 'utc' : 'local')
      key(field('go to'), 'Escape')
      await wait(200)
      const closed = !field('go to')
      return [opened && noAssist && tzOk && first.startsWith('orders-staging-env') && jumped && viaMenu && action && closed, `opens ${opened}, no spell check ${noAssist}, time zone (${tz}) offers [${tzOffered}], top hit "${first}", jumped ${jumped}, menu ${viaMenu}, action ${action}, esc ${closed}`]
    })

    const dropFile = async (parts, name) => {
      const dt = new DataTransfer()
      dt.items.add(new File(parts, name))
      document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      await wait(100)
      const hint = !!document.querySelector('.drop-overlay')
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      await wait(400)
      return hint
    }
    await step('drop a file: replace the open value, or start a new secret; binary refused; nothing saved', async () => {
      await openSecret('orders-dev-env')
      const before = await readSecret('orders-dev-env')
      const hint = await dropFile(['API_URL=https://dropped.example\nNEW_KEY=1\n'], 'orders-dev.env')
      const dialog = norm(document.querySelector('.drop-dialog')?.textContent)
      await press(['replace the value of orders-dev-env…'])
      await wait(400)
      const editorNote = norm(document.body.innerText).includes('dropped file orders-dev.env')
      const draft = [...document.querySelectorAll('input')].some((i) => i.value === 'https://dropped.example')
      await press(['cancel'])
      await dropFile(['TOKEN=abc\n'], 'billing-staging.env')
      await press(['new secret in*'])
      await wait(300)
      const prefilled = field('secret name')?.value === 'billing-staging' && field('secret value')?.value === 'TOKEN=abc\n'
      await press(['cancel'])
      await dropFile([new Uint8Array([0xff, 0x00, 0xfe])], 'blob.bin')
      const refused = norm(document.querySelector('.drop-dialog')?.textContent).includes('not text')
      await press(['ok'])
      const unchanged = (await readSecret('orders-dev-env')) === before
      return [hint && dialog.includes('2 keys') && editorNote && draft && prefilled && refused && unchanged, `drop hint ${hint}, dialog "${dialog.slice(0, 40)}…", editor note ${editorNote}, draft ${draft}, new prefilled ${prefilled}, binary refused ${refused}, value unchanged ${unchanged}`]
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
      await wait(500)
      const saved = (await call('GET', '/__selftest/saved')).json ?? {}
      const size = new TextEncoder().encode(await readSecret('orders-dev-env')).length
      const ok1 = saved.name === 'orders-dev-env.env' && saved.mode === '600' && saved.size === size
      await openSecret('orders-prod-env')
      await press(['reveal'])
      await press(['save to file…'])
      // unlocks on the word "confirm", not on the secret's name
      setField('type confirm to confirm', 'orders-prod-env')
      await wait(100)
      const locked = findButton(['choose where to save…'])?.disabled === true
      setField('type confirm to confirm', 'confirm')
      await wait(100)
      await press(['choose where to save…'])
      await wait(500)
      const saved2 = (await call('GET', '/__selftest/saved')).json ?? {}
      return [warned && above && ok1 && locked && saved2.name === 'orders-prod-env.env' && saved2.mode === '600', `warned ${warned}, above the keys ${above}, file ${saved.name} mode ${saved.mode} size ${saved.size}/${size}, protected locked ${locked}, then ${saved2.name} mode ${saved2.mode}`]
    })

    await step('act as: switch to a configured service account and back; status follows', async () => {
      const sel = field('act as')
      if (!sel) throw new Error('no act as picker')
      const deployer = (await optionsOf(sel)).find((o) => o.label.includes('deployer'))
      await choose(sel, deployer.value)
      await wait(800)
      const st = (await call('GET', '/api/status')).json
      const cfg = (await call('GET', '/api/config')).json
      const switched = st?.impersonating === 'deployer@demo-project.iam.gserviceaccount.com' && cfg?.credentials?.impersonateServiceAccount === st?.impersonating
      const listed = document.querySelectorAll('.rowbtn[aria-label]').length > 0
      await choose(field('act as'), (await optionsOf(field('act as')))[0].value)
      await wait(800)
      const back = !(await call('GET', '/api/status')).json?.impersonating
      return [switched && listed && back, `switched ${switched} (${st?.impersonating}), list reloaded ${listed}, back to you ${back}`]
    })

    await step('lock: hides the window, unlock asks for touch id', async () => {
      const before = Number((await fetch('/__selftest/authed').then((r) => r.text())) || 0)
      window.berglasUI.run('lock') // Go → Lock (⇧⌘L)
      await wait(300)
      const screen = vis(document.querySelector('.lock-screen'))
      const hidden = getComputedStyle(document.querySelector('header')).visibility === 'hidden'
      await press(['unlock with touch id…'])
      await wait(400)
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
      await wait(300)
      const byKey = vis(dialog())
      window.berglasUI.run('settings')
      await wait(200)
      const closed = !dialog()
      window.berglasUI.run('settings')
      await wait(300)
      const all = rows()
      // Find (⌘F, the Find menu) is the screen's own search box while it is open, not the window's find bar
      field('search settings').blur()
      window.berglasUI.run('find')
      await wait(200)
      const findHere = document.activeElement === field('search settings') && !vis(document.querySelector('.find-bar'))
      const complete = ['skin', 'theme', 'zoom', 'timeZone', 'envOrder', 'readOnly', 'protect', 'lockAfterMinutes', 'revealSeconds', 'clipboardClearSeconds', 'allowScreenCapture', 'auditLog', 'cacheSeconds', 'cacheEntries', 'watchMinutes', 'configFile'].every((k) => all.includes(k))
      // the browser version's settings are left out of the mac app
      const noBrowser = !all.includes('listen') && !all.includes('openBrowser')

      // search keeps only what matches
      setField('search settings', 'clipboard')
      await wait(200)
      const found = rows()
      setField('search settings', 'no such setting')
      await wait(200)
      const none = rows().length === 0
      setField('search settings', '')
      await wait(200)

      // an ordinary setting: saved on enter, no save bar; a letter is refused and not saved
      setField(input('cacheEntries'), '321')
      enter(input('cacheEntries'))
      await wait(500)
      const atOnce = (await cfg()).cacheEntries === 321 && !bar()
      setField(input('cacheEntries'), 'many')
      enter(input('cacheEntries'))
      await wait(300)
      const refused = (await cfg()).cacheEntries === 321
      setField(input('cacheEntries'), String(start.cacheEntries))
      enter(input('cacheEntries'))
      await wait(500)

      // safety settings: nothing is saved while editing; the bar lists both; one confirmation saves both
      field('Read-only').click()
      setField(input('lockAfterMinutes'), '7')
      await wait(300)
      const mid = await cfg()
      const staged = mid.readOnly === start.readOnly && mid.lockAfterMinutes === start.lockAfterMinutes && bar()?.querySelectorAll('li').length === 2
      // a field that is not a value holds the save back
      setField(input('revealSeconds'), 'soon')
      await wait(200)
      const held = !!findButton(['save safety settings…'], dialog())?.disabled
      setField(input('revealSeconds'), String(start.revealSeconds))
      await wait(200)
      await press(['save safety settings…'], dialog())
      const asked = !!findButton(['confirm'], dialog()) && (await cfg()).readOnly === start.readOnly
      await press(['confirm'], dialog())
      await wait(400)
      const after = await cfg()
      const savedBoth = after.readOnly === true && after.lockAfterMinutes === 7 && !bar()
      // read-only is in force at once: the core refuses a write
      const write = await call('POST', '/api/secrets/update', { ...ref('search-api-key'), plaintext: btoa('x') })
      const enforced = write.status === 403

      // back to how it was, the same way
      field('Read-only').click()
      setField(input('lockAfterMinutes'), String(start.lockAfterMinutes))
      await wait(300)
      await press(['save safety settings…'], dialog())
      await press(['confirm'], dialog())
      await wait(400)
      const back = await cfg()
      const restored = back.readOnly === start.readOnly && back.lockAfterMinutes === start.lockAfterMinutes

      // closing with an unsaved safety edit asks first; discarding saves nothing
      field('Read-only').click()
      await wait(200)
      window.berglasUI.run('settings')
      await wait(300)
      const asks = vis(dialog()) && !!findButton(['discard and close'], dialog())
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
      await wait(100)
      const list = document.getElementById(zoom.getAttribute('aria-controls'))
      const found = [...list.querySelectorAll('[role=option]')].map((o) => o.dataset.value)
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await wait(300)
      const picked = headerSelect('zoom').dataset.value
      await comboOpen(headerSelect('zoom'))
      document.querySelector('[aria-label="search zoom"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(150)
      const closed = !document.querySelector('[aria-label="search zoom"]')
      window.berglasUI.run('zoomReset')
      await wait(300)
      // and under the css zoom, where a fixed box's offsets are scaled
      window.berglasUI.run('zoomOut')
      window.berglasUI.run('zoomOut')
      await wait(400)
      await comboOpen(headerSelect('zoom'))
      const alignedZoomed = align()
      headerSelect('zoom').click()
      window.berglasUI.run('zoomReset')
      await wait(300)
      return [
        focused && aligned && alignedZoomed && found.join(',') === '150' && picked === '150' && closed && headerSelect('zoom').dataset.value === '100',
        `search focused ${focused}, under its button ${aligned} (zoomed ${alignedZoomed}), "15" → [${found}], enter picked ${picked} (was ${before}), esc closes ${closed}`,
      ]
    })

    await step('favourites and recents: star, list sections, ⌘K order, saved', async () => {
      await openSecret('orders-dev-env')
      await openSecret('orders-staging-env')
      await press(['add to favourites'])
      await wait(300)
      const cfg = (await call('GET', '/api/config')).json
      const saved = cfg?.favorites?.some((f) => f.name === 'orders-staging-env') && cfg?.recent?.[0]?.name === 'orders-staging-env' && cfg?.recent?.[1]?.name === 'orders-dev-env'
      const q = pane('.quick-list')
      const qt = norm(q?.textContent)
      const sections = !!q && qt.includes('orders-staging-env') && qt.includes('orders-dev-env')
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      await wait(300)
      const groups = [...document.querySelectorAll('.palette-group')].map((g) => norm(g.textContent))
      const firstHit = norm(document.querySelector('[role=option]')?.textContent)
      field('go to')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(200)
      await press(['remove from favourites'])
      await wait(300)
      const removed = !(await call('GET', '/api/config')).json?.favorites?.some((f) => f.name === 'orders-staging-env')
      return [saved && sections && groups[0] === 'favourites' && firstHit.startsWith('orders-staging-env') && removed, `saved ${saved}, list sections ${sections}, palette groups [${groups.slice(0, 3)}], first ${firstHit.slice(0, 20)}, unstarred ${removed}`]
    })

    await step('recent list: remove an entry, fold and unfold, both saved', async () => {
      await openSecret('orders-dev-env')
      await openSecret('tls-cert')
      const removeBtn = document.querySelector('[aria-label="remove orders-dev-env from recent"]')
      if (!removeBtn) throw new Error('no remove button on the recent row')
      removeBtn.click()
      await wait(400)
      const cfg = (await call('GET', '/api/config')).json
      const removed = !cfg?.recent?.some((r) => r.name === 'orders-dev-env') && !document.querySelector('[aria-label="remove orders-dev-env from recent"]')
      const toggle = pane('.quick-toggle')
      toggle.click()
      await wait(400)
      const folded = toggle.getAttribute('aria-expanded') === 'false' && !document.querySelector('[aria-label="remove tls-cert from recent"]') && (await call('GET', '/api/config')).json?.recentCollapsed === true
      pane('.quick-toggle').click()
      await wait(400)
      const unfolded = !!document.querySelector('[aria-label="remove tls-cert from recent"]') && (await call('GET', '/api/config')).json?.recentCollapsed === false
      return [removed && folded && unfolded, `removed and saved ${removed}, folded and saved ${folded}, unfolded and saved ${unfolded}`]
    })

    await step('deep links: open a secret, ask before adding a source, ignore bad links, copy link', async () => {
      const link = (u) => fetch('/__selftest/link?u=' + encodeURIComponent(u))
      await link('berglas-ui://open?backend=storage&parent=demo-bucket&name=payments-dev-env')
      await wait(800)
      const opened = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-dev-env')
      await link('berglas-ui://open?backend=s3&parent=demo-bucket&name=tls-cert')
      await wait(400)
      const ignored = norm(document.querySelector('.secret-pane')?.textContent).includes('payments-dev-env')
      await link('berglas-ui://open?backend=storage&parent=someone-elses-bucket&name=x-env')
      await wait(400)
      const asked = !!document.querySelector('[role=dialog][aria-label="open link"]')
      await press(['cancel'])
      const notAdded = !sourceRow('someone-elses-bucket') && !document.querySelector('[role=dialog][aria-label="open link"]')
      await press(['copy link', 'link'])
      await wait(300)
      const clip = await (await fetch('/__selftest/clipboard')).text()
      const copied = clip === 'berglas-ui://open?backend=storage&parent=demo-bucket&name=payments-dev-env'
      return [opened && ignored && asked && notAdded && copied, `opened ${opened}, bad link ignored ${ignored}, unknown source asked ${asked}, not added ${notAdded}, link copied ${copied}`]
    })

    await step('watch: someone else\'s write is reported and notified; opening clears it', async () => {
      await openSecret('orders-dev-env')
      await press(['watch'])
      await wait(300)
      const watching = (await call('GET', '/api/config')).json?.watch?.some((w) => w.name === 'orders-dev-env')
      await call('POST', '/api/watch/check', {}) // first look only records the version
      await openSecret('orders-staging-env')
      await fetch('/__selftest/external-write?name=orders-dev-env')
      const found = (await call('POST', '/api/watch/check', {})).json?.found ?? []
      await wait(600)
      const notified = (await (await fetch('/__selftest/notified')).text()).includes('orders-dev-env has a new version')
      const row = [...document.querySelectorAll('.quick-list button')].find((b) => vis(b) && norm(b.getAttribute('aria-label')).includes('orders-dev-env (changed)'))
      row?.click()
      await wait(800)
      const cleared = !((await call('GET', '/api/watch')).json?.changes ?? []).some((c) => c.name === 'orders-dev-env')
      await press(['watching'])
      await wait(300)
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
    for (let i = 0; i < 120 && !(mail = document.querySelector('a[href^="mailto:"]')); i++) await wait(250)
    mail?.click()
    await wait(400)
    const opened = await (await fetch('/__selftest/opened')).text()
    check('mailto link handed to the system, app stays', !!mail && opened.startsWith('mailto:') && location.href === before, `link ${!!mail}, opened ${JSON.stringify(opened)}, page ${location.href}`)
    await wait(3000) // time for a port check from outside
  } catch (e) {
    check('exception', false, String(e))
  }
  const ok = checks.every((c) => c.ok)
  await fetch('/__selftest?ok=' + (ok ? 1 : 0), { method: 'POST', body: JSON.stringify(checks) })
})()
