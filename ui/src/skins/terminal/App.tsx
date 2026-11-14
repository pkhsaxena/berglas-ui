import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuditError, type Ref } from '../../core/api'
import { copySecret } from '../../core/clipboard'
import { useApp } from '../../core/hooks/useApp'
import { pinnedId, usePinned } from '../../core/hooks/usePinned'
import { useSecretList } from '../../core/hooks/useSecretList'
import { matrixOf } from '../../core/overview'
import { SettingsActionsContext, SettingsContext } from '../../core/settings'
import { sourceId } from '../../core/sources'
import { type TimeZone, zoneName } from '../../core/time'
import { CreateSecret } from './components/CreateSecret'
import { Credit } from './components/Credit'
import { type MatrixSort, MatrixPane, OverviewPane } from './components/Overview'
import { PinnedPane } from './components/PinnedPane'
import { SecretDetail } from './components/SecretDetail'
import { SecretList } from './components/SecretList'
import { Sources } from './components/Sources'
import { ZOOM_STEPS } from '../../core/zoom'
import { useLayoutWidth } from '../../core/hooks/useLayoutWidth'
import { SKINS, skinFor } from '../registry'
import { applyTheme, knownTheme, PRESETS } from './theme'

// the system zone's name for the time switch, e.g. "ist"
const LOCAL_ZONE = zoneName(new Date())

export default function App() {
  const app = useApp()
  useLayoutWidth({ narrow: 820, wide: 2000 }, app.zoom)
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

  // `/` focuses the filter unless the user is typing somewhere
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
    const t = window.setTimeout(() => setToast(''), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  const list = useSecretList(active, session.kind === 'ready', listRev)
  const { pinned, pin, unpin } = usePinned()
  const copyText = async (text: string) => {
    try {
      await copySecret(text, app.settings.clipboardClearSeconds, setToast)
      setToast(app.settings.clipboardClearSeconds > 0 ? `copied · clears in ${app.settings.clipboardClearSeconds}s` : 'copied')
    } catch (e) {
      setErrorLine(`couldn't copy — ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // which view the right column shows at normal width; zoomed out, the
  // overview and matrix have their own column and this stays on 'secret'
  const [view, setView] = useState<'secret' | 'versions' | 'overview' | 'matrix'>('secret')
  // the matrix's row order, kept while switching views so it does not reset
  const [matrixSort, setMatrixSort] = useState<MatrixSort>(null)
  // with no secret open there are no versions to show
  const shownView = view === 'versions' && !selected ? 'secret' : view
  const select = (name: string) => {
    setCreating(false)
    setSelected(name)
    setView('secret')
  }

  const matrix = useMemo(() => (active && list.secrets ? matrixOf(list.secrets, active.group) : null), [active, list.secrets])

  // the view tabs, set into the title of the right column's top pane (normal width only)
  const titleTabs = active && (
    <span className="tabs pane-tabs" role="tablist" aria-label="right column">
      <button role="tab" className="tab-secret" aria-selected={shownView === 'secret'} onClick={() => setView('secret')} title={selected ?? undefined}>
        {creating ? 'new secret' : (selected ?? 'secret')}
      </button>
      {selected && !creating && (
        <button role="tab" aria-selected={shownView === 'versions'} onClick={() => setView('versions')}>
          versions
        </button>
      )}
      <button role="tab" aria-selected={shownView === 'overview'} onClick={() => setView('overview')}>
        overview
      </button>
      {matrix && (
        <button role="tab" aria-selected={shownView === 'matrix'} onClick={() => setView('matrix')}>
          matrix
        </button>
      )}
    </span>
  )

  // zoomed out, while a pin is compared with another open secret, the side
  // column hides and the versions column offers the overview and matrix
  const [wideView, setWideView] = useState<'versions' | 'overview' | 'matrix'>('versions')
  const wideTabs = active && (
    <span className="tabs pane-tabs" role="tablist" aria-label="versions column">
      <button role="tab" aria-selected={wideView === 'versions'} onClick={() => setWideView('versions')}>
        versions
      </button>
      <button role="tab" aria-selected={wideView === 'overview'} onClick={() => setWideView('overview')}>
        overview
      </button>
      {matrix && (
        <button role="tab" aria-selected={wideView === 'matrix'} onClick={() => setWideView('matrix')}>
          matrix
        </button>
      )}
    </span>
  )

  const base: Ref | null = useMemo(
    () => (active && selected ? { backend: active.backend, parent: active.parent, name: selected } : null),
    [active, selected],
  )

  const comparingPin =
    !!pinned && !!base && !(pinned.ref.backend === base.backend && pinned.ref.parent === base.parent && pinned.ref.name === base.name)
  const wideAlt =
    comparingPin && active && wideView === 'overview' ? (
      <OverviewPane source={active} list={list} onSelect={select} wideTabs={wideTabs} />
    ) : comparingPin && active && wideView === 'matrix' && matrix ? (
      <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} wideTabs={wideTabs} />
    ) : null

  return (
    <>
      <header className="top">
        <span className="app">berglas-ui</span>
        {session.kind === 'ready' &&
          (session.status.demo ? (
            <span className="t-keyword small">demo · made-up secrets in memory · nothing reaches google cloud</span>
          ) : (
            <span className="muted small">
              {session.status.account || 'unknown account'}
              {session.status.impersonating && ' (impersonated)'}
              {session.status.project && ` · ${session.status.project}`}
              {session.status.quotaProject && ` · quota: ${session.status.quotaProject}`}
            </span>
          ))}
        <span className="spacer" />
        {session.kind === 'ready' && (
          <label>
            time
            <select value={app.settings.timeZone} onChange={(e) => app.setTimeZone(e.target.value as TimeZone)}>
              <option value="local">local ({LOCAL_ZONE})</option>
              <option value="utc">utc</option>
            </select>
          </label>
        )}
        {SKINS.length > 1 && (
          <label>
            skin
            <select value={skinFor(app.skin).name} onChange={(e) => app.setSkin(e.target.value)}>
              {SKINS.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label title="zoom out to give the layout more room (zoomed out far enough, panes sit side by side)">
          zoom
          <select value={app.zoom} onChange={(e) => app.setZoom(Number(e.target.value))}>
            {(ZOOM_STEPS.includes(app.zoom) ? ZOOM_STEPS : [...ZOOM_STEPS, app.zoom].sort((a, b) => a - b)).map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </label>
        <label>
          theme
          <select value={theme} onChange={(e) => app.setTheme(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      </header>

      <SettingsContext.Provider value={app.settings}>
        <SettingsActionsContext.Provider value={actions}>
          <main>
            {errorLine && (
              <div role="alert" className="row" style={{ marginTop: 8 }}>
                <span className="t-error">error: {errorLine}</span>
                <button onClick={() => setErrorLine('')}>dismiss</button>
              </div>
            )}
            {session.kind === 'loading' && (
              <div className="term-ln" style={{ marginTop: 12 }}>
                <span className="t-prompt">$</span> <span className="t-function">gcloud</span> <span className="t-string">auth check</span>
                <div className="muted"># checking application default credentials…</div>
              </div>
            )}

            {session.kind === 'unauthorized' && (
              <div style={{ marginTop: 12 }}>
                <div className="t-error">error: this browser is not paired with the running core.</div>
                <div className="muted"># open the link printed in the terminal that started berglas-ui. it carries a one-session token.</div>
              </div>
            )}

            {session.kind === 'offline' && (
              <div style={{ marginTop: 12 }}>
                <div className="t-error">error: {session.message}</div>
                <div className="row">
                  <button onClick={app.retry}>retry</button>
                </div>
              </div>
            )}

            {session.kind === 'no-credentials' && (
              <div style={{ marginTop: 12 }}>
                <div className="t-error">error: no usable google credentials — {session.status.error}</div>
                <div className="term-ln">
                  <span className="t-prompt">$</span> <span className="t-function">gcloud</span>{' '}
                  <span className="t-string">auth application-default login</span>
                </div>
                <div className="muted"># run that in a terminal, then retry. berglas-ui uses your own google identity and iam permissions.</div>
                <div className="row">
                  <button onClick={app.retry}>retry</button>
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
                      onCreate={() => {
                        setSelected(null)
                        setCreating(true)
                        setView('secret')
                      }}
                    />
                  )}
                </div>

                {/* zoomed out only: the matrix over the overview, always in view */}
                {active && (
                  <div className="side-col">
                    {matrix && <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} />}
                    <OverviewPane source={active} list={list} onSelect={select} />
                  </div>
                )}

                {active && (
                  <div className={pinned ? 'main-area with-pin' : 'main-area'}>
                    {pinned && (
                      <PinnedPane
                        key={`${pinnedId(pinned)}|${base ? `${base.parent}/${base.name}` : ''}`}
                        pinned={pinned}
                        other={base}
                        onUnpin={unpin}
                        onCopy={copyText}
                        onOpen={() => {
                          const src = app.sources.find((x) => x.backend === pinned.ref.backend && x.parent === pinned.ref.parent)
                          if (src && sourceId(src) !== sourceId(active)) app.setActive(src)
                          select(pinned.ref.name)
                        }}
                      />
                    )}

                    {shownView === 'overview' ? (
                      <div className="right single">
                        <OverviewPane source={active} list={list} onSelect={select} titleTabs={titleTabs} />
                      </div>
                    ) : shownView === 'matrix' && matrix ? (
                      <div className="right single">
                        <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} titleTabs={titleTabs} />
                      </div>
                    ) : creating ? (
                      <div className="right single">
                        <CreateSecret
                          titleTabs={titleTabs}
                          key={sourceId(active)}
                          source={active}
                          onCancel={() => setCreating(false)}
                          onCreated={(s) => {
                            setToast('created')
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
                          setToast(`pinned ${p.ref.name} — open another secret to compare`)
                        }}
                      />
                    ) : (
                      <>
                        {/* nothing open: overview and matrix here at normal width; zoomed out they are in the side column */}
                        <div className={matrix ? 'right overview normal-only' : 'right overview single normal-only'}>
                          <OverviewPane source={active} list={list} onSelect={select} titleTabs={titleTabs} />
                          {matrix && <MatrixPane source={active} matrix={matrix} selected={selected} onSelect={select} sort={matrixSort} onSort={setMatrixSort} />}
                        </div>
                        <div className="right single wide-only">
                          <div className="card pane">
                            <h2>secret</h2>
                            <div className="body">
                              <div className="muted"># pick a secret in the list or the matrix. values stay hidden until you reveal them.</div>
                            </div>
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

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
