import type { SecretRef, WatchChange } from '../../../core/api'
import { hasRef, refKey } from '../../../core/refs'
import { type Source, sourceId, sourceName } from '../../../core/sources'

type Props = {
  favorites: SecretRef[]
  recent: SecretRef[]
  watch: SecretRef[]
  /** watched secrets with a version this app didn't write, until opened */
  changes: WatchChange[]
  sources: Source[]
  active: Source
  selected: string | null
  onOpen: (r: SecretRef) => void
  /** the recent list folded to its heading, and how to fold it */
  recentCollapsed: boolean
  onRecentCollapsed: (collapsed: boolean) => void
  /** takes a secret off the recent list */
  onRemoveRecent: (r: SecretRef) => void
}

/** Starred and recently opened secrets, from any source, above the list. */
export function QuickList({ favorites, recent, watch, changes, sources, active, selected, onOpen, recentCollapsed, onRecentCollapsed, onRemoveRecent }: Props) {
  const known = (r: SecretRef) => sources.find((s) => sourceId(s) === `${r.backend}:${r.parent}`)
  const recentOnly = recent.filter((r) => !hasRef(favorites, r) && known(r)).slice(0, 5)
  const favs = favorites.filter((r) => known(r))
  const changed = changes.filter((c) => known(c))
  if (favs.length === 0 && recentOnly.length === 0 && changed.length === 0) return null
  const row = (r: SecretRef, kind: 'fav' | 'recent') => {
    const src = known(r)!
    const here = sourceId(src) === sourceId(active)
    return (
      <li key={`${kind}-${refKey(r)}`} className="quick-row">
        <button className="rowbtn secret quick" aria-label={`open ${r.name}`} aria-current={here && r.name === selected ? 'true' : undefined} onClick={() => onOpen(r)} title={`${sourceName(src)} / ${r.name}`}>
          <span className="line">
            <span className={kind === 'fav' ? 'quick-mark fav' : 'quick-mark'} aria-hidden="true">
              {kind === 'fav' ? '★' : '↺'}
            </span>
            <span className="nm">{r.name}</span>
            {hasRef(watch, r) && <span className="badge small-badge">watching</span>}
          </span>
          {!here && <span className="meta">{sourceName(src)}</span>}
        </button>
        {kind === 'recent' && (
          <button className="quick-remove" aria-label={`remove ${r.name} from recent`} title="Remove from recent" onClick={() => onRemoveRecent(r)}>
            ×
          </button>
        )}
      </li>
    )
  }
  return (
    <div className="quick-list">
      {changed.length > 0 && (
        <>
          <div className="group-key changed-key">Changed</div>
          <ul className="clean grouped">
            {changed.map((c) => (
              <li key={`chg-${refKey(c)}`}>
                <button className="rowbtn secret quick changed" aria-label={`open ${c.name} (changed)`} onClick={() => onOpen(c)} title={`${sourceName(known(c)!)} / ${c.name}`}>
                  <span className="line">
                    <span className="quick-mark changed-dot" aria-hidden="true">●</span>
                    <span className="nm">{c.name}</span>
                  </span>
                  <span className="meta">{c.deleted ? 'deleted' : `new version #${c.version}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {favs.length > 0 && (
        <>
          <div className="group-key">Favourites</div>
          <ul className="clean grouped">{favs.map((r) => row(r, 'fav'))}</ul>
        </>
      )}
      {recentOnly.length > 0 && (
        <>
          <button className="group-key quick-toggle" aria-expanded={!recentCollapsed} onClick={() => onRecentCollapsed(!recentCollapsed)} title={recentCollapsed ? 'Show recent secrets' : 'Hide recent secrets'}>
            <span className="quick-caret" aria-hidden="true">
              {recentCollapsed ? '▸' : '▾'}
            </span>
            Recent
            <span className="count">{recentOnly.length}</span>
          </button>
          {!recentCollapsed && <ul className="clean grouped">{recentOnly.map((r) => row(r, 'recent'))}</ul>}
        </>
      )}
    </div>
  )
}
