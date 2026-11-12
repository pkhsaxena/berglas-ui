// Copies secret values and clears them from the clipboard later. Clearing
// only happens if the clipboard still holds the copied value, so text the
// user copied afterwards is never wiped. In a browser, reading the clipboard
// needs permission; without it the value is left and the caller is told.

/** Where copies go. The browser's clipboard api by default; the desktop app swaps in its own. */
export type ClipboardBackend = {
  write: (text: string) => Promise<void>
  /** empties the clipboard if it still holds text; says whether it did */
  clearIf: (text: string) => Promise<boolean>
}

const browserClipboard: ClipboardBackend = {
  write: (text) => navigator.clipboard.writeText(text),
  clearIf: async (text) => {
    if ((await navigator.clipboard.readText()) !== text) return false
    await navigator.clipboard.writeText('')
    return true
  },
}

let backend: ClipboardBackend = browserClipboard
let pending: number | undefined

export function setClipboardBackend(b: ClipboardBackend | null) {
  backend = b ?? browserClipboard
}

export async function copySecret(text: string, clearSeconds: number, onNote: (msg: string) => void): Promise<void> {
  await backend.write(text)
  window.clearTimeout(pending)
  if (clearSeconds <= 0) return
  pending = window.setTimeout(async () => {
    try {
      if (await backend.clearIf(text)) onNote('clipboard cleared')
    } catch {
      onNote("couldn't check the clipboard (permission or focus) — the copied value is still there")
    }
  }, clearSeconds * 1000)
}
