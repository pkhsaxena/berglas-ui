// The keyboard shortcuts the app has, for the cheat sheet that `?` opens.
// Keep in step with the handlers: usePalette (⌘K), useSettingsScreen (⌘, and
// ⌘F inside settings), the skins' `/` and Esc handlers, useShortcuts (`?`),
// and the mac app's menus in core/cmd/berglas-ui-desktop/main.go.

export type Shortcut = { keys: string[]; what: string }
export type ShortcutGroup = { title: string; items: Shortcut[]; desktopOnly?: boolean }

/** ⌘ on a Mac, Ctrl elsewhere. */
export function modKey(platform = typeof navigator === 'undefined' ? '' : navigator.platform): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl+'
}

export function shortcutGroups(mod = modKey()): ShortcutGroup[] {
  return [
    {
      title: 'Anywhere',
      items: [
        { keys: [`${mod}K`], what: 'Go to a secret, source or action' },
        { keys: [`${mod},`], what: 'Settings (again to close)' },
        { keys: ['/'], what: 'Filter the secret list' },
        { keys: ['?'], what: 'This list of shortcuts' },
        { keys: ['Esc'], what: 'Close a dialog, clear a filter, hide a revealed value' },
      ],
    },
    {
      title: 'Lists, pickers and ⌘K',
      items: [
        { keys: ['↑', '↓'], what: 'Move' },
        { keys: ['Enter'], what: 'Open or pick' },
        { keys: ['Esc'], what: 'Close' },
      ],
    },
    {
      title: 'Settings',
      items: [{ keys: [`${mod}F`], what: 'Search the settings' }],
    },
    {
      title: 'Mac app',
      desktopOnly: true,
      items: [
        { keys: [`${mod}F`], what: 'Find in the window' },
        { keys: [`${mod}G`, `⇧${mod}G`], what: 'Next or previous match' },
        { keys: [`⇧${mod}L`], what: 'Lock' },
        { keys: [`${mod}=`, `${mod}-`, `${mod}0`], what: 'Zoom in, out, actual size' },
      ],
    },
  ]
}
