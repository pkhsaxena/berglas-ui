// BERGLAS_UI_SELFTEST=layout: does the page itself scroll in the app window?
// Reports sizes and which elements stick out past the viewport.
;(async () => {
  await new Promise((r) => setTimeout(r, 1500))
  const se = document.scrollingElement
  const cs = (el) => getComputedStyle(el)
  // an element a clipping ancestor hides (overflow hidden or clip) can't make
  // the page scroll while that ancestor fits: the credit line slides up from
  // below its bar, so mid-slide (or with animations paused in a hidden
  // window) its box reads past the bottom though nothing shows there
  const clippedInView = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = cs(a)
      if (/(hidden|clip)/.test(o.overflowY) || /(hidden|clip)/.test(o.overflow)) return a.getBoundingClientRect().bottom <= innerHeight + 1
    }
    return false
  }
  const measure = (label) => {
    const tall = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().bottom > innerHeight + 1 && !el.closest('.pane > .body, .scroll, .tablewrap') && !clippedInView(el))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} bottom ${Math.round(el.getBoundingClientRect().bottom)}`)
    window.scrollTo(0, 99999)
    const scrolledTo = se.scrollTop
    window.scrollTo(0, 0)
    return [
      { name: `${label}: page height fits`, ok: se.scrollHeight <= innerHeight + 1, detail: `scrollHeight ${se.scrollHeight} / ${innerHeight}, scrollWidth ${se.scrollWidth} / ${innerWidth}` },
      { name: `${label}: page cannot be scrolled`, ok: scrolledTo === 0, detail: `scrollTop ${scrolledTo}` },
      { name: `${label}: nothing past the bottom`, ok: tall.length === 0, detail: tall.join(' · ') || 'none' },
    ]
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const button = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase() === t && b.getBoundingClientRect().width)
  // where the credit line is, and how far through its slide-in, for when this check is read later
  const credit = () => {
    const line = document.querySelector('.credit-line')
    const bar = line?.parentElement
    if (!line || !bar) return 'no credit line'
    const an = line.getAnimations()[0]
    return `credit bar bottom ${Math.round(bar.getBoundingClientRect().bottom)}, line bottom ${Math.round(line.getBoundingClientRect().bottom)} (${an ? `${an.playState} at ${Math.round(an.currentTime ?? 0)} ms` : 'not animating'}), transform ${cs(line).transform}`
  }
  const checks = [{ name: 'viewport', ok: true, detail: `${innerWidth}x${innerHeight}; ${credit()}` }, ...measure('start')]
  document.querySelector('.rowbtn[aria-label="payments-dev-env"]')?.click()
  await wait(600)
  checks.push(...measure('secret open'))
  button('reveal')?.click()
  await wait(600)
  checks.push(...measure('revealed'))
  button('pin')?.click()
  await wait(300)
  document.querySelector('.rowbtn[aria-label="payments-prod-env"]')?.click()
  await wait(600)
  checks.push(...measure('pinned + other open'))
  // the side bar hidden (⌘B): the main area takes its room and the page still fits, at normal size and zoomed out
  const sideGone = (label) => {
    const left = document.querySelector('.layout > .left')
    const main = document.querySelector('.layout > .main-area')
    const x = Math.round(main?.getBoundingClientRect().left ?? -1)
    return { name: `${label}: the main area takes the side bar's room`, ok: !!left && getComputedStyle(left).display === 'none' && x >= 0 && x < 40, detail: `side bar ${left ? getComputedStyle(left).display : 'missing'}, main area starts at x ${x}` }
  }
  window.berglasUI.run('sidebar')
  await wait(400)
  checks.push(sideGone('side bar hidden'), ...measure('side bar hidden'))
  for (let i = 0; i < 5; i++) window.berglasUI.run('zoomOut')
  await wait(500)
  checks.push(sideGone('side bar hidden, zoomed out'), ...measure('side bar hidden, zoomed out'))
  window.berglasUI.run('zoomReset')
  window.berglasUI.run('sidebar')
  await wait(400)
  checks.push({ name: 'html/body overflow and overscroll', ok: true, detail: `html ${cs(document.documentElement).overflow}/${cs(document.documentElement).overscrollBehavior}, body ${cs(document.body).overflow}/${cs(document.body).overscrollBehavior}` })
  // a pane in a fit-content row keeps to its content when the window changes
  // width: narrow wraps the sources pane's text taller, and enlarging the
  // window must not leave it that tall (WebKit kept the old height)
  const sourcesFit = () => {
    const body = document.querySelector('.left > :first-child > .body')
    const pad = parseFloat(cs(body).paddingBottom) || 0
    const content = Math.round(body.lastElementChild.getBoundingClientRect().bottom + pad - body.getBoundingClientRect().top)
    const box = Math.round(body.getBoundingClientRect().height)
    const capped = body.scrollHeight > body.clientHeight + 1
    return { ok: capped || Math.abs(box - content) <= 2, detail: `${innerWidth}x${innerHeight} ${document.getElementById('root').dataset.width}: body ${box}, content ${content}${capped ? ' (capped, scrolls)' : ''}` }
  }
  for (const [w, h] of [[900, 700], [1900, 1000], [1000, 700], [1440, 900]]) {
    await fetch(`/__selftest/resize?w=${w}&h=${h}`)
    await wait(900)
    checks.push({ name: `sources pane fits its content after resizing to ${w}x${h}`, ...sourcesFit() })
  }
  const ok = checks.every((c) => c.ok)
  await fetch('/__selftest?ok=' + (ok ? 1 : 0), { method: 'POST', body: JSON.stringify(checks) })
})()
