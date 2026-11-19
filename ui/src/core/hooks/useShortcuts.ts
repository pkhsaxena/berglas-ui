import { useEffect, useState } from 'react'
import { onCommand } from '../commands'
import { inDesktop } from '../desktop'
import { shortcutGroups } from '../shortcuts'

/**
 * The shortcut cheat sheet: `?` opens it (unless typing in a field), as do
 * ⌘K's "Keyboard shortcuts" and the mac app's Help menu; Esc or `?` closes
 * it. Outside the mac app its menu-only shortcuts are marked as such.
 */
export function useShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => onCommand('shortcuts', () => setOpen(true)), [])

  return { open, show: () => setOpen(true), close: () => setOpen(false), groups: shortcutGroups(), desktop: inDesktop() }
}

export type Shortcuts = ReturnType<typeof useShortcuts>
