import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuditError, type Ref } from '../../core/api'
import { useApp } from '../../core/hooks/useApp'
import { SettingsContext } from '../../core/settings'
import { sourceId } from '../../core/sources'
import { CreateSecret } from './components/CreateSecret'
import { SecretDetail } from './components/SecretDetail'
import { SecretList } from './components/SecretList'
import { Sources } from './components/Sources'
import { applyTheme, knownTheme, PRESETS } from './theme'

export default function App() {
  const app = useApp()
  const { session, active } = app
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // bumped after a create or delete so the list reloads
  const [listRev, setListRev] = useState(0)
  const [toast, setToast] = useState('')
  const [auditError, setAuditError] = useState('')

  useEffect(() => onAuditError(setAuditError), [])
  const filterRef = useRef<HTMLInputElement>(null)
  const theme = knownTheme(app.theme)

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

  const base: Ref | null = useMemo(
    () => (active && selected ? { backend: active.backend, parent: active.parent, name: selected } : null),
    [active, selected],
  )

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
        <main>
          {auditError && (
            <div role="alert" className="row" style={{ marginTop: 8 }}>
              <span className="t-error">error: {auditError}</span>
              <button onClick={() => setAuditError('')}>dismiss</button>
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
            <>
              <Sources
                sources={app.sources}
                configPath={app.configPath}
                saveError={app.configError}
                active={active}
                onSelect={(s) => {
                  if (!active || sourceId(active) !== sourceId(s)) {
                    app.setActive(s)
                    setSelected(null)
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
                <div className="grid">
                  <SecretList
                    key={`${sourceId(active)}#${listRev}`}
                    ref={filterRef}
                    source={active}
                    selected={selected}
                    onSelect={(n) => {
                      setCreating(false)
                      setSelected(n)
                    }}
                    onCreate={() => {
                      setSelected(null)
                      setCreating(true)
                    }}
                  />
                  <div className="detail-col">
                    {creating ? (
                      <CreateSecret
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
                    ) : base ? (
                      <SecretDetail
                        key={`${base.backend}:${base.parent}/${base.name}`}
                        base={base}
                        onToast={setToast}
                        onDeleted={() => {
                          setSelected(null)
                          setListRev((n) => n + 1)
                        }}
                      />
                    ) : (
                      <div className="card">
                        <h2>secret</h2>
                        <div className="muted"># pick a secret on the left to see its metadata and versions. values stay hidden until you reveal them.</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </SettingsContext.Provider>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
