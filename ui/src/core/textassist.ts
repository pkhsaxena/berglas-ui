// No spell check, autocorrect, capitalisation or word suggestions anywhere in
// the app: the fields hold secret names, keys and values, where a correction
// is always wrong and a suggestion popup gets in the way (macOS shows one in
// the ⌘K box after a single letter). index.html sets the attributes on
// <html>; this also stamps each field as it appears, for engines that don't
// inherit one of them.
const OFF: Record<string, string> = { spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', writingsuggestions: 'false' }

function stamp(el: Element) {
  for (const [k, v] of Object.entries(OFF)) if (el.getAttribute(k) !== v) el.setAttribute(k, v)
}

function stampAll(root: ParentNode) {
  root.querySelectorAll('input, textarea, [contenteditable]').forEach(stamp)
}

/** Starts stamping; call once at startup. */
export function disableTextAssist() {
  stampAll(document)
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue
        if (n.matches('input, textarea, [contenteditable]')) stamp(n)
        stampAll(n)
      }
  }).observe(document.documentElement, { childList: true, subtree: true })
}
