import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuditError, type Ref } from '../../core/api'
import { copySecret } from '../../core/clipboard'
import { useApp } from '../../core/hooks/useApp'
import { useDrift } from '../../core/hooks/useDrift'
import { usePalette } from '../../core/hooks/usePalette'
import { useLock } from '../../core/hooks/useLock'
import { useWatch } from '../../core/hooks/useWatch'
import { type LinkTarget, onOpenLink } from '../../core/commands'
import { linkFor } from '../../core/deeplink'
import { copyPlain } from '../../core/clipboard'
import { type DroppedFile, suggestName, useFileDrop } from '../../core/hooks/useFileDrop'
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
import { sourceId } from '../../core/sources'
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
import { FileDrop } from './components/FileDrop'
import { type MatrixSort, MatrixPane, OverviewPane } from './components/Overview'
import { PinnedPane } from './components/PinnedPane'
import { SecretDetail } from './components/SecretDetail'
import { SecretList } from './components/SecretList'
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
  // bumped after a create or delete so the list reloads
  const [listRev, setListRev] = useState(0)
  const [toast, setToast] = useState('')
  const [errorLine, setErrorLine] = useState('')

  useEffect(() => onAuditError(setErrorLine), [])
  const filterRef = useRef<HTMLInputElement>(null)
  const theme = knownTheme(app.theme)
  const { setEnvOrder } = app
  const actions = useMemo(() => ({ setEnvOrder }), [setEnvOrder])

  useEffect(() => applyTheme(theme), [theme])

  // `/` focuses the secret filter unless the user is typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.key === '/' && filterRef.current) {
        e.preventDefault()
        filterRef.current.focus()
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
        else setLinkAsk(t)
      }),
    [app.sources],
  )

  /** Opens a favourite or recent secret, switching source when it lives elsewhere. */
  const openRef = (r: SecretRef) => {
    const src = app.sources.find((x) => x.backend === r.backend && x.parent === r.parent)
    if (!src) return
    if (!active || sourceId(active) !== sourceId(src)) app.setActive(src)
    select(r.name)
  }
  openRefRef.current = openRef
  const lockState = useLock(session.kind === 'ready' ? app.settings.lockAfterMinutes : 0)
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
    setCreating(false)
    setSelected(name)
    setView('secret')
  }

  const matrix = useMemo(() => (active && list.secrets ? matrixOf(list.secrets, active.group) : null), [active, list.secrets])
  const drift = useDrift(active, matrix)
  // a matrix row's name opens the drift view for that service and compares it
  const openDrift = (service: string) => {
    setCreating(false)
    setView('drift')
    void drift.run(service)
  }

  // a file dropped onto the window becomes a draft: the open secret's new value, or a new secret
  const drop = useFileDrop(session.kind === 'ready' && !!active)
  const [dropEdit, setDropEdit] = useState<DroppedFile | null>(null)
  const [createInitial, setCreateInitial] = useState<{ id: number; name: string; text: string; from: string } | null>(null)
  const writable = !!active && !readOnlyFor(app.settings, active)

  // ⌘K: the open source's secrets (and cached ones of other sources), sources and actions
  const openSource = (s: (typeof app.sources)[number]) => {
    if (!active || sourceId(active) !== sourceId(s)) app.setActive(s)
    setSelected(null)
    setCreating(false)
    setView('secret')
  }
  const palette = usePalette(() =>
    paletteItems({
      sources: app.sources,
      active,
      secrets: list.secrets ?? null,
      favorites: app.favorites,
      recent: app.recent,
      openSecret: (src, name) => {
        if (!active || sourceId(active) !== sourceId(src)) app.setActive(src)
        select(name)
      },
      setActive: openSource,
      actions: paletteActions({
        newSecret:
          active && !readOnlyFor(app.settings, active)
            ? () => {
                setSelected(null)
                setCreateInitial(null)
                setCreating(true)
                setView('secret')
              }
            : undefined,
        refresh: active ? () => void list.refresh() : undefined,
        views: active ? (['overview', ...(matrix ? ['matrix'] : []), ...(drift.services.length ? ['drift'] : [])] as PaletteView[]) : [],
        showView: (v) => {
          setCreating(false)
          setView(v)
        },
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
        setIdentity: (o) => void app.setIdentity(o.serviceAccount, o.quotaProject),
        lock: lockState.lock,
        checkWatched: app.watch.length ? () => void watch.checkNow() : undefined,
      }),
    }),
  )

  // the view tabs, set into the header of the main column's top pane (normal width only)
  const titleTabs = active && (
    <span className="seg" role="tablist" aria-label="main view">
      <button role="tab" aria-selected={shownView === 'secret'} onClick={() => setView('secret')} title={selected ?? undefined}>
        {creating ? 'New secret' : 'Secret'}
      </button>
      {selected && !creating && (
        <button role="tab" aria-selected={shownView === 'versions'} onClick={() => setView('versions')}>
          Versions
        </button>
      )}
      <button role="tab" aria-selected={shownView === 'overview'} onClick={() => setView('overview')}>
        Overview
      </button>
      {matrix && (
        <button role="tab" aria-selected={shownView === 'matrix'} onClick={() => setView('matrix')}>
          Matrix
        </button>
      )}
      {drift.services.length > 0 && (
        <button role="tab" aria-selected={shownView === 'drift'} onClick={() => setView('drift')}>
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
                if (o) void app.setIdentity(o.serviceAccount, o.quotaProject)
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
              <div className={`layout${active ? ' has-side' : ''}${comparingPin ? ' comparing' : ''}`}>
                <div className="left">
                  <Sources
                    sources={app.sources}
                    configPath={app.configPath}
                    saveError={app.configError}
                    active={active}
                    onSelect={(s) => {
                      if (!active || sourceId(active) !== sourceId(s)) {
                        app.setActive(s)
                        setSelected(null)
                        setCreating(false)
                        setView('secret')
                      }
                    }}
                    onAdd={(s) => {
                      const err = app.addSource(s)
                      if (!err) setSelected(null)
                      return err
                    }}
                    onRemove={(s) => {
                      if (active && sourceId(active) === sourceId(s)) setSelected(null)
                      app.removeSource(s)
                    }}
                  />
                  {active && (
                    <SecretList
                      ref={filterRef}
                      source={active}
                      list={list}
                      selected={selected}
                      onSelect={select}
                      quick={<QuickList favorites={app.favorites} recent={app.recent} watch={app.watch} sources={app.sources} active={active} selected={selected} onOpen={openRef} changes={watch.changes} recentCollapsed={app.recentCollapsed} onRecentCollapsed={app.setRecentCollapsed} onRemoveRecent={app.removeRecent} />}
                      onCreate={() => {
                        setSelected(null)
                        setCreateInitial(null)
                        setCreating(true)
                        setView('secret')
                      }}
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
                            copyPlain(linkFor(base)).then(
                              () => setToast('Link copied'),
                              (e) => setErrorLine(`Couldn't copy the link — ${e instanceof Error ? e.message : String(e)}`),
                            )
                          },
                        }}
                        onDroppedUsed={() => setDropEdit(null)}
                        group={active.group}
                        onToast={setToast}
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
        <FileDrop
          drop={drop}
          replaceTarget={selected && writable && !creating ? selected : null}
          createIn={writable ? active.label || active.parent : null}
          onReplace={() => {
            setDropEdit(drop.dropped)
            setView('secret')
            drop.clear()
          }}
          onCreate={() => {
            const f = drop.dropped
            if (f) setCreateInitial({ id: f.id, name: suggestName(f.name), text: f.text, from: f.name })
            setSelected(null)
            setCreating(true)
            setView('secret')
            drop.clear()
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
