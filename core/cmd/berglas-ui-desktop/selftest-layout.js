// BERGLAS_UI_SELFTEST=layout: does the page itself scroll in the app window?
// Reports sizes and which elements stick out past the viewport.
;(async () => {
  await new Promise((r) => setTimeout(r, 1500))
  const se = document.scrollingElement
  const cs = (el) => getComputedStyle(el)
  const measure = (label) => {
    const tall = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().bottom > innerHeight + 1 && !el.closest('.pane > .body, .scroll, .tablewrap'))
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
  const checks = [{ name: 'viewport', ok: true, detail: `${innerWidth}x${innerHeight}` }, ...measure('start')]
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
