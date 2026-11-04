// Copies secret values and clears them from the clipboard later. Clearing
// only happens if the clipboard still holds the copied value, so text the
// user copied afterwards is never wiped. Reading the clipboard needs the
// browser's permission; without it the value is left and the caller is told.

let pending: number | undefined

export async function copySecret(text: string, clearSeconds: number, onNote: (msg: string) => void): Promise<void> {
  await navigator.clipboard.writeText(text)
  window.clearTimeout(pending)
  if (clearSeconds <= 0) return
  pending = window.setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) !== text) return // replaced since; leave it
      await navigator.clipboard.writeText('')
      onNote('clipboard cleared')
    } catch {
      onNote("couldn't check the clipboard (permission or focus) — the copied value is still there")
    }
  }, clearSeconds * 1000)
}
