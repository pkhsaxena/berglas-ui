// Runs before every self-test script (BERGLAS_UI_SELFTEST): the window stops
// taking input from a person, so a stray click, key, scroll, hover or file
// drag can't move the test off course. Real input arrives as trusted events;
// the test drives the ui with el.click() and dispatchEvent(), which never are,
// so only people are kept out. Quit (⌘Q) still works: the menu bar is the
// app's, not the page's (main.go turns its other items off during a test).
;(() => {
  const kinds = [
    // pointing: clicks, presses, hover (rows react to it), scrolling, the context menu
    'click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
    'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
    'touchstart', 'touchmove', 'touchend', 'wheel',
    // typing, and what a paste or a typed character turns into
    'keydown', 'keyup', 'keypress', 'beforeinput', 'paste', 'cut', 'copy',
    // files dragged in from Finder
    'dragenter', 'dragover', 'dragleave', 'drop',
  ]
  const stop = (e) => {
    if (!e.isTrusted) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  for (const k of kinds) window.addEventListener(k, stop, { capture: true, passive: false })
})()
