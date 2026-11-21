import { useEffect } from 'react'
import { onCommand } from '../commands'

/**
 * The side bar (sources and the secret list) hidden or shown: the skins'
 * header button, ⌘K, the mac app's View → Hide Side Bar (⌘B), and ⌘B (Ctrl+B)
 * in the page for the browser version (the mac app's menu takes the key
 * first). The state is a config setting, so it survives restarts.
 */
export function useSidebar(collapsed: boolean, setCollapsed: (v: boolean) => void) {
  const toggle = () => setCollapsed(!collapsed)

  useEffect(() => onCommand('sidebar', () => setCollapsed(!collapsed)), [collapsed, setCollapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      e.preventDefault()
      setCollapsed(!collapsed)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, setCollapsed])

  return { collapsed, toggle, show: () => collapsed && setCollapsed(false) }
}

export type Sidebar = ReturnType<typeof useSidebar>
