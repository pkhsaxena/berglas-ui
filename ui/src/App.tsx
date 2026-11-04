import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type Ref, type Secret, type Status } from './api'
import { SecretDetail } from './components/SecretDetail'
import { SecretList } from './components/SecretList'
import { Sources } from './components/Sources'
import { loadSources, saveSources, type Source, sourceId } from './sources'
import { onThemeChange, PRESETS, saveTheme, storedTheme } from './theme'

type Session = { kind: 'loading' } | { kind: 'unauthorized' } | { kind: 'offline'; message: string } | { kind: 'ok'; status: Status }

export default function App() {
  const [theme, setTheme] = useState(storedTheme)
  const [session, setSession] = useState<Session>({ kind: 'loading' })
  const [sources, setSources] = useState<Source[]>(loadSources)
  const [active, setActive] = useState<Source | null>(() => loadSources()[0] ?? null)
  const [secrets, setSecrets] = useState<Secret[] | null>(null)
  const [listErr, setListErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)

  useEffect(() => onThemeChange(setTheme), [])

  const loadStatus = useCallback(async () => {
    try {
      setSession({ kind: 'ok', status: await api.status() })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession({ kind: 'unauthorized' })
      else setSession({ kind: 'offline', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const checkStatus = () => {
    setSession({ kind: 'loading' })
    void loadStatus()
  }

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const ready = session.kind === 'ok' && session.status.credentials

  const refresh = useCallback(async () => {
    if (!active) return
    setLoading(true)
    setListErr('')
    try {
      setSecrets(await api.list(active.backend, active.parent))
    } catch (e) {
      setSecrets(null)
      setListErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [active])

  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

  const switchSource = (s: Source | null) => {
    setActive(s)
    setSecrets(null)
    setListErr('')
    setSelected(null)
  }

  // `/` focuses the filter unless the user is typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
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

  const updateSources = (list: Source[]) => {
    setSources(list)
    saveSources(list)
  }

  const base: Ref | null = useMemo(
    () => (active && selected ? { backend: active.backend, parent: active.parent, name: selected } : null),
    [active, selected],
  )

  return (
    <>
      <header className="top">
        <span className="app">berglas-ui</span>
        {session.kind === 'ok' && session.status.credentials && (
          <span className="muted small">
            {session.status.account || 'unknown account'}
            {session.status.project && ` · ${session.status.project}`}
          </span>
        )}
        <span className="spacer" />
        <label>
          theme
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value)
              saveTheme(e.target.value)
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      </header>

      <main>
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
              <button onClick={checkStatus}>retry</button>
            </div>
          </div>
        )}

        {session.kind === 'ok' && !session.status.credentials && (
          <div style={{ marginTop: 12 }}>
            <div className="t-error">error: no usable google credentials — {session.status.error}</div>
            <div className="term-ln">
              <span className="t-prompt">$</span> <span className="t-function">gcloud</span>{' '}
              <span className="t-string">auth application-default login</span>
            </div>
            <div className="muted"># run that in a terminal, then retry. berglas-ui uses your own google identity and iam permissions.</div>
            <div className="row">
              <button onClick={checkStatus}>retry</button>
            </div>
          </div>
        )}

        {ready && (
          <>
            <Sources
              sources={sources}
              active={active}
              onSelect={(s) => {
                if (!active || sourceId(active) !== sourceId(s)) switchSource(s)
              }}
              onAdd={(s) => {
                updateSources([...sources, s])
                switchSource(s)
              }}
              onRemove={(s) => {
                const list = sources.filter((x) => sourceId(x) !== sourceId(s))
                updateSources(list)
                if (active && sourceId(active) === sourceId(s)) switchSource(list[0] ?? null)
              }}
            />
            {active && (
              <div className="grid">
                <SecretList
                  ref={filterRef}
                  source={active}
                  secrets={secrets}
                  loading={loading}
                  error={listErr}
                  selected={selected}
                  onSelect={setSelected}
                  onRefresh={refresh}
                />
                <div>
                  {base ? (
                    <SecretDetail key={`${base.backend}:${base.parent}/${base.name}`} base={base} onToast={setToast} />
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

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
}
