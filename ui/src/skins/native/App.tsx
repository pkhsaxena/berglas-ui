import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuditError, type Ref } from '../../core/api'
import { copySecret } from '../../core/clipboard'
import { useApp } from '../../core/hooks/useApp'
import { useDrift } from '../../core/hooks/useDrift'
import { usePalette } from '../../core/hooks/usePalette'
import { useSettingsScreen } from '../../core/hooks/useSettingsScreen'
import { useSetup } from '../../core/hooks/useSetup'
import { useLeaveGuard } from '../../core/hooks/useLeaveGuard'
import { useShortcuts } from '../../core/hooks/useShortcuts'
import { claim, useOverlay } from '../../core/overlays'
import { choiceOptions } from '../../core/settingsModel'
import { useLock } from '../../core/hooks/useLock'
import { useWatch } from '../../core/hooks/useWatch'
import { type LinkTarget, onOpenLink } from '../../core/commands'
import { linkFor } from '../../core/deeplink'
import { type DroppedFile, useFileDrop } from '../../core/hooks/useFileDrop'
import { useDropPicker } from '../../core/hooks/useDropPicker'
import { useSidebar } from '../../core/hooks/useSidebar'
import { modKey } from '../../core/shortcuts'
import { nameProblem } from '../../core/hooks/useCreate'
import { useFind } from '../../core/hooks/useFind'
import { useLayoutWidth } from '../../core/hooks/useLayoutWidth'
import { pinnedId, usePinned } from '../../core/hooks/usePinned'
import { useSecretList } from '../../core/hooks/useSecretList'
import { identityOptions } from '../../core/identity'
import { hasRef } from '../../core/refs'
import type { SecretRef } from '../../core/api'
import { matrixOf } from '../../core/overview'
import { paletteActions, paletteItems, type PaletteView } from '../../core/palette'
import { readOnlyFor } from '../../core/settings'
import { runCommand } from '../../core/commands'
import { SettingsActionsContext, SettingsContext } from '../../core/settings'
import { sourceId, sourceName } from '../../core/sources'
import { type TimeZone, zoneName } from '../../core/time'
import { stepZoom, ZOOM_STEPS } from '../../core/zoom'
import { SKINS, skinFor } from '../registry'
import { PaneHead } from './components/bits'
import { CreateSecret } from './components/CreateSecret'
import { Credit } from './components/Credit'
import { DriftPane } from './components/Drift'
import { FindBar } from './components/FindBar'
import { Palette } from './components/Palette'
import { QuickList } from './components/QuickList'
import { LinkDialog } from './components/LinkDialog'
import { LockScreen } from './components/LockScreen'
import { Setup } from './components/Setup'
import { LeaveDialog } from './components/LeaveDialog'
import { ShortcutSheet } from './components/ShortcutSheet'
import { FileDrop } from './components/FileDrop'
import { type MatrixSort, MatrixPane, OverviewPane } from './components/Overview'
import { PinnedPane } from './components/PinnedPane'
import { SecretDetail } from './components/SecretDetail'
import { SecretList } from './components/SecretList'
import { Settings } from './components/Settings'
import { Sources } from './components/Sources'
import { applyTheme, knownTheme, THEMES } from './theme'
import { Select } from './components/Select'

const LOCAL_ZONE = zoneName(new Date())

export default function App() {
  const app = useApp()
  const find = useFind()
  useLayoutWidth({ narrow: 860, wide: 1900 }, app.zoom)
  const { session, active } = app
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // the open secret's editor is up: leaving its view would drop the draft
  const [editing, setEditing] = useState(false)
  // bumped after a create or delete so the list reloads
  const [listRev, setListRev] = useState(0)
  const [toast, setToast] = useState('')
  // unsaved edits: every way of moving elsewhere asks before dropping them
  const leave = useLeaveGuard()
  // ?: the keyboard shortcut list
  const shortcuts = useShortcuts()
  const [errorLine, setErrorLine] = useState('')

  useEffect(() => onAuditError(setErrorLine), [])
  const filterRef = useRef<HTMLInputElement>(null)
  const theme = knownTheme(app.theme)
  const { setEnvOrder } = app
  const sidebar = useSidebar(app.sidebarCollapsed, app.setSidebarCollapsed)
  const sidebarRef = useRef(sidebar)
  sidebarRef.current = sidebar
  const actions = useMemo(() => ({ setEnvOrder }), [setEnvOrder])

  useEffect(() => applyTheme(theme), [theme])

  // `/` focuses the secret filter unless the user is typing somewhere (showing the side bar first if it is hidden)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.key === '/' && filterRef.current) {
        e.preventDefault()
        if (sidebarRef.current.collapsed) {
          sidebarRef.current.show()
          window.setTimeout(() => filterRef.current?.focus(), 0)
        } else filterRef.current.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  const ids = identityOptions(app.identity)
  // whichever secret ends up open goes to the front of the recent list
  useEffect(() => {
    if (active && selected) app.noteRecent({ backend: active.backend, parent: active.parent, name: selected })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.backend, active?.parent, selected])
  // watched secrets: what changed since you last opened them
  const watch = useWatch(app.watch, session.kind === 'ready')
  useEffect(() => {
    if (active && selected) watch.ack({ backend: active.backend, parent: active.parent, name: selected })
  }, [active, selected, watch.ack, watch.changes])
  const changeCount = watch.changes.length
  const lastCount = useRef(0)
  useEffect(() => {
    if (changeCount > lastCount.current) setToast(changeCount === 1 ? `${watch.changes[0].name} changed` : `${changeCount} watched secrets changed`)
    lastCount.current = changeCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeCount])

  // berglas-ui:// links: open the secret; a source you haven't added is asked about first
  const [linkAsk, setLinkAsk] = useState<LinkTarget | null>(null)
  const openRefRef = useRef<(r: SecretRef) => void>(() => {})
  useEffect(
    () =>
      onOpenLink((t) => {
        if (app.sources.some((x) => x.backend === t.backend && x.parent === t.parent)) openRefRef.current(t)
        else if (claim('link')) setLinkAsk(t)
      }),
    [app.sources],
  )
  useOverlay('link', 'panel', !!linkAsk, { close: () => setLinkAsk(null) })

  /** Opens a favourite or recent secret, switching source when it lives elsewhere. */
  const openRef = (r: SecretRef) => {
    const src = app.sources.find((x) => x.backend === r.backend && x.parent === r.parent)
    if (!src) return
    leave.guard(() => {
      if (!active || sourceId(active) !== sourceId(src)) app.setActive(src)
      select(r.name)
    })
  }
  openRefRef.current = openRef
  const lockState = useLock(session.kind === 'ready' ? app.settings.lockAfterMinutes : 0)
  // ⌘,: the settings screen; there is a config to show once the core has answered
  const settingsScreen = useSettingsScreen({
    enabled: session.kind === 'ready' || session.kind === 'no-credentials',
    settings: app.settings,
    sources: app.sources,
    skin: skinFor(app.skin).name,
    theme,
    zoom: app.zoom,
    recentCollapsed: app.recentCollapsed,
    sidebarCollapsed: app.sidebarCollapsed,
    setSkin: app.setSkin,
    setTheme: app.setTheme,
    setZoom: app.setZoom,
    setTimeZone: app.setTimeZone,
    setEnvOrder: app.setEnvOrder,
    setRecentCollapsed: app.setRecentCollapsed,
    setSidebarCollapsed: app.setSidebarCollapsed,
    saveSettings: app.saveSettings,
    onToast: setToast,
  })
  // a fresh install (no sources) opens the setup guide; ⌘K and the sources pane open it later
  const setup = useSetup({
    enabled: session.kind === 'ready',
    sources: app.sources,
    settings: app.settings,
    saveSettings: app.saveSettings,
    demo: app.demo,
    onDone: (src) =>
      leave.guard(() => {
        app.setActive(src)
        setSelected(null)
        setCreating(false)
        setView('secret')
      }),
  })
  // a new identity may see other secrets: reload the list and close the open one
  useEffect(() => {
    if (app.identityRev === 0) return
    setSelected(null)
    setCreating(false)
  }, [app.identityRev])
  const list = useSecretList(active, session.kind === 'ready', listRev + app.identityRev)
  const { pinned, pin, unpin, setPinnedValue, clearPinnedValue } = usePinned()
  const copyText = async (text: string) => {
    try {
      await copySecret(text, app.settings.clipboardClearSeconds, setToast)
      setToast(app.settings.clipboardClearSeconds > 0 ? `Copied · clears in ${app.settings.clipboardClearSeconds}s` : 'Copied')
    } catch (e) {
      setErrorLine(`Couldn't copy — ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // which view the main column shows at normal width; zoomed out, the
  // overview and matrix have their own column and this stays on 'secret'
  const [view, setView] = useState<'secret' | 'versions' | 'overview' | 'matrix' | 'drift'>('secret')
  const [matrixSort, setMatrixSort] = useState<MatrixSort>(null)
  const shownView = view === 'versions' && !selected ? 'secret' : view
  const select = (name: string) => {
    // the secret already open: nothing is left behind
    if (name === selected && !creating) return setView('secret')
    leave.guard(() => {
      setCreating(false)
      setSelected(name)
      setView('secret')
    })
  }

  const matrix = useMemo(() => (active && list.secrets ? matrixOf(list.secrets, active.group) : null), [active, list.secrets])
  const drift = useDrift(active, matrix)
  // a matrix row's name opens the drift view for that service and compares it
  const openDrift = (service: string) =>
    leave.guard(() => {
      setCreating(false)
      setView('drift')
      void drift.run(service)
    })

  // a file dropped onto the window becomes a draft: any secret's new value, or a new secret
  const drop = useFileDrop(session.kind === 'ready' && !!active)
  const [dropEdit, setDropEdit] = useState<DroppedFile | null>(null)
  const [createInitial, setCreateInitial] = useState<{ id: number; name: string; text: string; from: string } | null>(null)
  const writable = !!active && !readOnlyFor(app.settings, active)
  const secretNames = useMemo(() => (list.secrets ?? []).map((s) => s.name), [list.secrets])
  // after a drop: search the open source for the secret to replace, or name a new one; either opens on its review screen
  const picker = useDropPicker({
    dropped: drop.dropped,
    names: secretNames,
    open: creating ? null : selected,
    writable,
    nameProblem: (n) => (active ? nameProblem(active.backend, n) : ''),
    onCancel: drop.clear,
    onChoose: (c, f) => {
      drop.clear()
      leave.guard(() => {
        if (c.kind === 'replace') {
          setCreating(false)
          setSelected(c.name)
          setDropEdit(f)
        } else {
          setCreateInitial({ id: f.id, name: c.name, text: f.text, from: f.name })
          setSelected(null)
          setCreating(true)
        }
        setView('secret')
      })
    },
  })

  // ⌘K: the open source's secrets (and cached ones of other sources), sources and actions
  const openSource = (s: (typeof app.sources)[number]) =>
    leave.guard(() => {
      if (!active || sourceId(active) !== sourceId(s)) app.setActive(s)
      setSelected(null)
      setCreating(false)
      setView('secret')
    })
  const palette = usePalette(() =>
    paletteItems({
      sources: app.sources,
      active,
      secrets: list.secrets ?? null,
      favorites: app.favorites,
      recent: app.recent,
      openSecret: (src, name) =>
        leave.guard(() => {
          if (!active || sourceId(active) !== sourceId(src)) app.setActive(src)
          select(name)
        }),
      setActive: openSource,
      actions: paletteActions({
        newSecret:
          active && !readOnlyFor(app.settings, active)
            ? () =>
                leave.guard(() => {
                  setSelected(null)
                  setCreateInitial(null)
                  setCreating(true)
                  setView('secret')
                })
            : undefined,
        refresh: active ? () => void list.refresh() : undefined,
        views: active ? (['overview', ...(matrix ? ['matrix'] : []), ...(drift.services.length ? ['drift'] : [])] as PaletteView[]) : [],
        showView: (v) =>
          leave.guard(() => {
            setCreating(false)
            setView(v)
          }),
        driftServices: drift.services,
        openDrift,
        find: () => runCommand('find'),
        zoom: (d) => app.setZoom(d === 0 ? 100 : stepZoom(app.zoom, d)),
        themes: THEMES,
        theme,
        skin: skinFor(app.skin).name,
        timeZone: app.settings.timeZone,
        setTheme: app.setTheme,
        skins: SKINS,
        setSkin: app.setSkin,
        setTimeZone: app.setTimeZone,
        identities: ids.options.length > 1 ? ids.options.filter((o) => o.key !== ids.current) : [],
        setIdentity: (o) => leave.guard(() => void app.setIdentity(o.serviceAccount, o.quotaProject)),
        lock: lockState.lock,
        settings: settingsScreen.show,
        setup: setup.show,
        shortcuts: shortcuts.show,
        sidebar: { collapsed: sidebar.collapsed, toggle: sidebar.toggle },
        checkWatched: app.watch.length ? () => void watch.checkNow() : undefined,
      }),
    }),
  )

  // the view tabs, set into the header of the main column's top pane (normal width only)
  // while a secret is being edited or created, the other views wait: switching would drop the draft
  const drafting = editing || creating
  const titleTabs = active && (
    <span className="seg" role="tablist" aria-label="main view">
      <button role="tab" aria-selected={shownView === 'secret'} onClick={() => setView('secret')} title={selected ?? undefined}>
        {creating ? 'New secret' : 'Secret'}
      </button>
      {selected && !creating && (
        <button role="tab" aria-selected={shownView === 'versions'} onClick={() => setView('versions')} disabled={drafting} title={drafting ? 'Finish or cancel the edit first' : undefined}>
          Versions
        </button>
      )}
      <button role="tab" aria-selected={shownView === 'overview'} onClick={() => setView('overview')} disabled={drafting} title={drafting ? 'Finish or cancel the edit first' : undefined}>
        Overview
      </button>
      {matrix && (
        <button role="tab" aria-selected={shownView === 'matrix'} onClick={() => setView('matrix')} disabled={drafting} title={drafting ? 'Finish or cancel the edit first' : undefined}>
          Matrix
        </button>
      )}
      {drift.services.length > 0 && (
        <button role="tab" aria-selected={shownView === 'drift'} onClick={() => setView('drift')} disabled={drafting} title={drafting ? 'Finish or cancel the edit first' : undefined}>
          Drift
        </button>
      )}
    </span>
  )

  // zoomed out, while a pin is compared with another open secret, the side
  // column hides and the versions column offers the overview and matrix
  const [wideView, setWideView] = useState<'versions' | 'overview' | 'matrix'>('versions')
  const wideTabs = active && (
    <span className="seg" role="tablist" aria-label="versions column">
      <button role="tab" aria-selected={wideView === 'versions'} onClick={() => setWideView('versions')}>
        Versions
      </button>
      <button role="tab" aria-selected={wideView === 'overview'} onClick={() => setWideView('overview')}>
        Overview
      </button>
      {matrix && (
        <button role="tab" aria-selected={wideView === 'matrix'} onClick={() => setWideView('matrix')}>
          Matrix
        </button>
      )}
    </span>
  )

  const base: Ref | null = useMemo(() => (active && selected ? { backend: active.backend, parent: active.parent, name: selected } : null), [active, selected])

  const comparingPin = !!pinned && !!base && !(pinned.ref.backend === base.backend && pinned.ref.parent === base.parent && pinned.ref.name === base.name)
  // while the pinned secret is itself the open one, its own pane shows it: no second pane for the same secret
  const pinShown = !!pinned && (!base || comparingPin)
  const wideAlt =
    comparingPin && active && wideView === 'overview' ? (
      <OverviewPane source={active} list={list} onSelect={select} wideTabs={wideTabs} />
    ) : comparingPin && active && wideView === 'matrix' && matrix ? (
      <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} onDrift={openDrift} wideTabs={wideTabs} />
    ) : null

  return (
    <>
      <header className="toolbar">
        {session.kind === 'ready' && (
          <button className="side-toggle" onClick={sidebar.toggle} aria-label={sidebar.collapsed ? 'show side bar' : 'hide side bar'} aria-pressed={!sidebar.collapsed} title={`${sidebar.collapsed ? 'Show' : 'Hide'} the side bar (${modKey()}B)`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
              <path d="M6 2.5v11" />
              {!sidebar.collapsed && <path d="M2.8 5h2M2.8 7h2M2.8 9h2" />}
            </svg>
          </button>
        )}
        <span className="app">berglas-ui</span>
        {session.kind === 'ready' &&
          (session.status.demo ? (
            <span className="badge warn">Demo — made-up secrets in memory, nothing reaches Google Cloud</span>
          ) : (
            <span className="muted small">
              {session.status.account || 'unknown account'}
              {session.status.project && ` · ${session.status.project}`}
              {session.status.quotaProject && ` · quota: ${session.status.quotaProject}`}
            </span>
          ))}
        {session.kind === 'ready' && ids.options.length > 1 && (
          <span className="act-as" title="the identity berglas-ui uses for every call; your gcloud login stays the same">
            <span className="muted small">Act as</span>
            <Select
              ariaLabel="act as"
              value={ids.current}
              disabled={app.switching}
              options={ids.options.map((o) => ({ value: o.key, label: o.label, hint: o.serviceAccount || undefined }))}
              onChange={(key) => {
                const o = ids.options.find((x) => x.key === key)
                if (o) leave.guard(() => void app.setIdentity(o.serviceAccount, o.quotaProject))
              }}
            />
          </span>
        )}
        <span className="spacer" />
        {session.kind === 'ready' && (
          <label>
            Time
            <Select
              ariaLabel="time"
              value={app.settings.timeZone}
              options={[
                { value: 'local', label: `Local (${LOCAL_ZONE})` },
                { value: 'utc', label: 'UTC' },
              ]}
              onChange={(v) => app.setTimeZone(v as TimeZone)}
            />
          </label>
        )}
        <label title="zoom out to give the layout more room (zoomed out far enough, panes sit side by side)">
          Zoom
          <Select
            ariaLabel="zoom"
            value={String(app.zoom)}
            options={(ZOOM_STEPS.includes(app.zoom) ? ZOOM_STEPS : [...ZOOM_STEPS, app.zoom].sort((a, b) => a - b)).map((z) => ({ value: String(z), label: `${z}%` }))}
            onChange={(v) => app.setZoom(Number(v))}
          />
        </label>
        <label>
          Theme
          <Select ariaLabel="theme" value={theme} options={THEMES.map((t) => ({ value: t, label: t }))} onChange={app.setTheme} />
        </label>
        {SKINS.length > 1 && (
          <label>
            Skin
            <Select ariaLabel="skin" value={skinFor(app.skin).name} options={SKINS.map((s) => ({ value: s.name, label: s.label }))} onChange={app.setSkin} />
          </label>
        )}
        {(session.kind === 'ready' || session.kind === 'no-credentials') && (
          <button className="btn" onClick={settingsScreen.show} title="every setting, with search (⌘,)">
            Settings
          </button>
        )}
      </header>

      <SettingsContext.Provider value={app.settings}>
        <SettingsActionsContext.Provider value={actions}>
          <main>
            {errorLine && (
              <div role="alert" className="row" style={{ margin: '8px 16px 0' }}>
                <span className="bad-text">{errorLine}</span>
                <button className="btn" onClick={() => setErrorLine('')}>
                  Dismiss
                </button>
              </div>
            )}
            {session.kind === 'loading' && <div className="notice muted">Checking your Google credentials…</div>}
            {session.kind === 'unauthorized' && (
              <div className="notice">
                <div className="bad-text strong">This browser isn't paired with the running core.</div>
                <div className="muted">Open the link printed in the terminal that started berglas-ui. It carries a one-session token.</div>
              </div>
            )}
            {session.kind === 'offline' && (
              <div className="notice">
                <div className="bad-text strong">{session.message}</div>
                <div>
                  <button className="btn" onClick={app.retry}>
                    Retry
                  </button>
                </div>
              </div>
            )}
            {session.kind === 'no-credentials' && (
              <div className="notice">
                <div className="bad-text strong">No usable Google credentials — {session.status.error}</div>
                <div>
                  Run <span className="mono">gcloud auth application-default login</span> in a terminal, then retry. berglas-ui uses your own Google identity and IAM permissions.
                </div>
                <div>
                  <button className="btn" onClick={app.retry}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {session.kind === 'ready' && (
              <div className={`layout${active ? ' has-side' : ''}${comparingPin ? ' comparing' : ''}${sidebar.collapsed ? ' side-hidden' : ''}`}>
                <div className="left">
                  <Sources
                    sources={app.sources}
                    configPath={app.configPath}
                    saveError={app.configError}
                    active={active}
                    onSelect={(s) => {
                      if (!active || sourceId(active) !== sourceId(s)) {
                        leave.guard(() => {
                          app.setActive(s)
                          setSelected(null)
                          setCreating(false)
                          setView('secret')
                        })
                      }
                    }}
                    onAdd={(s) => {
                      const err = app.addSource(s)
                      if (!err) setSelected(null)
                      return err
                    }}
                    onRemove={(s) => {
                      // removing the open source closes what is open in it
                      if (active && sourceId(active) === sourceId(s))
                        leave.guard(() => {
                          setSelected(null)
                          app.removeSource(s)
                        })
                      else app.removeSource(s)
                    }}
                    onSetup={setup.show}
                  />
                  {active && (
                    <SecretList
                      ref={filterRef}
                      source={active}
                      list={list}
                      selected={selected}
                      onSelect={select}
                      quick={<QuickList favorites={app.favorites} recent={app.recent} watch={app.watch} sources={app.sources} active={active} selected={selected} onOpen={openRef} changes={watch.changes} recentCollapsed={app.recentCollapsed} onRecentCollapsed={app.setRecentCollapsed} onRemoveRecent={app.removeRecent} />}
                      onCreate={() =>
                        leave.guard(() => {
                          setSelected(null)
                          setCreateInitial(null)
                          setCreating(true)
                          setView('secret')
                        })
                      }
                    />
                  )}
                </div>

                {/* zoomed out only: the matrix over the overview, always in view */}
                {active && (
                  <div className="side-col">
                    {matrix && (
                      <MatrixPane
                        source={active}
                        matrix={matrix}
                        selected={selected}
                        onSelect={select}
                        sort={matrixSort}
                        onSort={setMatrixSort}
                        onDrift={openDrift}
                        driftOpen={shownView === 'drift'}
                        onToggleDrift={drift.services.length > 0 ? () => setView(shownView === 'drift' ? 'secret' : 'drift') : undefined}
                      />
                    )}
                    <OverviewPane source={active} list={list} onSelect={select} />
                  </div>
                )}

                {active && (
                  <div className={pinShown ? 'main-area with-pin' : 'main-area'}>
                    {pinned && pinShown && (
                      <PinnedPane
                        key={`${pinnedId(pinned)}|${base ? `${base.parent}/${base.name}` : ''}`}
                        pinned={pinned}
                        group={app.sources.find((x) => x.backend === pinned.ref.backend && x.parent === pinned.ref.parent)?.group}
                        onUnpin={unpin}
                        onCopy={copyText}
                        onValue={setPinnedValue}
                        onHide={clearPinnedValue}
                        onToast={setToast}
                      />
                    )}

                    {shownView === 'overview' ? (
                      <div className="right single">
                        <OverviewPane source={active} list={list} onSelect={select} titleTabs={titleTabs} />
                      </div>
                    ) : shownView === 'matrix' && matrix ? (
                      <div className="right single">
                        <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} onDrift={openDrift} titleTabs={titleTabs} />
                      </div>
                    ) : shownView === 'drift' ? (
                      <div className="right single">
                        <DriftPane drift={drift} onSelect={select} titleTabs={titleTabs} />
                      </div>
                    ) : creating ? (
                      <div className="right single">
                        <CreateSecret
                          titleTabs={titleTabs}
                          key={`${sourceId(active)}|${createInitial?.id ?? ''}`}
                          source={active}
                          initial={createInitial ?? undefined}
                          onDirty={leave.setDirty}
                          onCancel={() => {
                            setCreating(false)
                            setCreateInitial(null)
                          }}
                          onCreated={(s) => {
                            setCreateInitial(null)
                            setToast('Created')
                            setCreating(false)
                            setListRev((n) => n + 1)
                            setSelected(s.name)
                          }}
                        />
                      </div>
                    ) : base ? (
                      <SecretDetail
                        key={`${base.backend}:${base.parent}/${base.name}`}
                        base={base}
                        dropped={dropEdit}
                        marks={{
                          favorite: hasRef(app.favorites, base),
                          watched: hasRef(app.watch, base),
                          onFavorite: () => app.toggleFavorite(base),
                          onWatch: () => app.toggleWatch(base),
                          onCopyLink: () => {
                            copySecret(linkFor(base), app.settings.clipboardClearSeconds, setToast).then(
                              () => setToast(app.settings.clipboardClearSeconds > 0 ? `Link copied · clears in ${app.settings.clipboardClearSeconds}s` : 'Link copied'),
                              (e) => setErrorLine(`Couldn't copy the link — ${e instanceof Error ? e.message : String(e)}`),
                            )
                          },
                        }}
                        onDroppedUsed={() => setDropEdit(null)}
                        group={active.group}
                        onToast={setToast}
                        onEditing={setEditing}
                        onDirty={leave.setDirty}
                        onDeleted={() => {
                          setSelected(null)
                          setListRev((n) => n + 1)
                        }}
                        showVersions={shownView === 'versions'}
                        titleTabs={titleTabs}
                        wideTabs={comparingPin ? wideTabs : undefined}
                        wideAlt={wideAlt}
                        pinned={pinned}
                        onPin={(p) => {
                          pin(p)
                          setToast(`Pinned ${p.ref.name} — open another secret to compare`)
                        }}
                      />
                    ) : (
                      <>
                        {/* nothing open: overview and matrix here at normal width; zoomed out they are in the side column */}
                        <div className={matrix ? 'right overview normal-only' : 'right overview single normal-only'}>
                          <OverviewPane source={active} list={list} onSelect={select} titleTabs={titleTabs} />
                          {matrix && <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} onDrift={openDrift} />}
                        </div>
                        <div className="right single wide-only">
                          <div className="pane">
                            <PaneHead title="No secret selected" />
                            <div className="body muted">Pick a secret in the list or the matrix. Values stay hidden until you reveal them.</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </main>
        </SettingsActionsContext.Provider>
      </SettingsContext.Provider>

      <Credit />
      <FindBar f={find} />
      {session.kind === 'ready' && <Palette p={palette} />}
      <Settings
        s={settingsScreen}
        sources={app.sources}
        choices={choiceOptions({ skins: SKINS, themes: THEMES, zoomSteps: ZOOM_STEPS, zoom: app.zoom, localZone: LOCAL_ZONE })}
        identity={{
          options: ids.options,
          current: ids.current,
          serviceAccount: app.identity.impersonateServiceAccount ?? '',
          quotaProject: app.identity.quotaProject ?? '',
          switching: app.switching,
          error: app.configError.startsWith("couldn't switch identity") ? app.configError : '',
          apply: (sa, quota) => leave.guard(() => void app.setIdentity(sa, quota)),
        }}
        configPath={app.configPath}
        version={session.kind === 'ready' || session.kind === 'no-credentials' ? session.status.version : ''}
      />
      <Setup s={setup} configPath={app.configPath} />
      <LeaveDialog g={leave} />
      <ShortcutSheet s={shortcuts} />
      <LockScreen l={lockState} />
      {linkAsk && (
        <LinkDialog
          target={linkAsk}
          onCancel={() => setLinkAsk(null)}
          onAdd={() => {
            const t = linkAsk
            setLinkAsk(null)
            const err = app.addSource({ backend: t.backend, parent: t.parent })
            if (err) setErrorLine(`Couldn't add ${t.parent} — ${err}`)
            else select(t.name)
          }}
        />
      )}
      {session.kind === 'ready' && active && (
        <FileDrop drop={drop} picker={picker} sourceName={active.label || active.parent} group={active.group} writable={writable} />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {app.removed && (
        <div className="toast undo-bar" role="status">
          <span>Removed {sourceName(app.removed)} from the list. Nothing was deleted.</span>
          <button onClick={app.undoRemove}>Undo</button>
          <button onClick={app.dismissRemoved} aria-label="dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  )
}
