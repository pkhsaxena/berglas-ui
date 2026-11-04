import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, decodeValue, type Ref, refString, type Secret, versionOf } from '../api'
import { looksLikeEnv, parseEnv } from '../envfile'
import { ago, stamp } from '../time'

// A revealed value is dropped from memory after this long, on version change,
// and on Esc, so a value is never left on screen unattended.
const HIDE_AFTER_MS = 60_000
const MASK = '••••••••••••'

type Props = {
  base: Ref // backend + parent + name, no version
  onToast: (msg: string) => void
}

type Revealed = { version: string; text: string | null; size: number }

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : String(e))

export function SecretDetail({ base, onToast }: Props) {
  const [versions, setVersions] = useState<Secret[] | null>(null)
  const [verErr, setVerErr] = useState('')
  const [version, setVersion] = useState<string>('') // '' = latest
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [view, setView] = useState<'env' | 'raw'>('env')
  const hideTimer = useRef<number | undefined>(undefined)

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current)
    setRevealed(null)
  }, [])

  // The parent keys this component by secret, so state starts fresh per secret.
  useEffect(() => {
    let live = true
    api
      .versions(base)
      .then((v) => live && setVersions(v))
      .catch((e) => live && setVerErr(errMsg(e)))
    return () => {
      live = false
    }
  }, [base])

  useEffect(() => hide, [hide])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide])

  const current = versions?.[0]
  const shown = versions?.find((v) => versionOf(v) === version) ?? current
  const ref: Ref = { ...base, version: version || undefined }

  const fetchValue = async () => {
    const s = await api.read(ref)
    const { bytes, text } = decodeValue(s.plaintext)
    return { version: versionOf(s), text, size: bytes.length }
  }

  const reveal = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await fetchValue()
      setRevealed(r)
      setView(r.text !== null && looksLikeEnv(r.text) ? 'env' : 'raw')
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setRevealed(null), HIDE_AFTER_MS)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text?: string) => {
    setErr('')
    try {
      let value = text
      if (value === undefined) {
        setBusy(true)
        const r = await fetchValue()
        if (r.text === null) throw new Error('binary value — it cannot be copied as text')
        value = r.text
      }
      await navigator.clipboard.writeText(value)
      onToast('copied')
    } catch (e) {
      setErr(`couldn't copy — ${errMsg(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const pickVersion = (v: string) => {
    hide()
    setVersion(v === versionOf(current ?? ({} as Secret)) ? '' : v)
  }

  const env = revealed?.text != null && looksLikeEnv(revealed.text) ? parseEnv(revealed.text) : null

  return (
    <>
      <div className="card">
        <h2>
          secret <span className="muted">— {base.name}</span>
        </h2>
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">cat</span> <span className="t-string">{refString(ref)}</span>
        </div>

        {verErr ? (
          <div role="alert" className="t-error">
            error: {verErr}
          </div>
        ) : versions === null ? (
          <div className="muted"># loading metadata…</div>
        ) : !shown ? (
          <div className="muted"># no versions found — the secret may have just been deleted. refresh the list.</div>
        ) : (
          <div style={{ margin: '6px 0' }}>
            <div className="kv">
              <span className="label">{base.backend === 'storage' ? 'generation' : 'version'}</span>
              <span>
                {versionOf(shown)} {shown === current ? <span className="pill good">latest</span> : <span className="pill warn">old</span>}
              </span>
            </div>
            <div className="kv">
              <span className="label">updated</span>
              <span className="str">
                {stamp(shown.updatedAt)} <span className="muted">· {ago(shown.updatedAt)}</span>
              </span>
            </div>
            {shown.kmsKey && (
              <div className="kv">
                <span className="label">kms key</span>
                <span className="str">{shown.kmsKey}</span>
              </div>
            )}
            {base.backend === 'sm' && (
              <div className="kv">
                <span className="label">replication</span>
                <span className="str">{shown.locations?.length ? shown.locations.join(', ') : 'automatic'}</span>
              </div>
            )}
          </div>
        )}

        <div className="row">
          {revealed ? (
            <button onClick={hide}>hide</button>
          ) : (
            <button onClick={reveal} disabled={busy || !shown}>
              {busy ? 'decrypting…' : 'reveal'}
            </button>
          )}
          <button onClick={() => copy(revealed?.text ?? undefined)} disabled={busy || !shown}>
            copy<span className="wide-only"> value</span>
          </button>
          {revealed && env && (
            <div className="tabs" role="tablist" aria-label="value view">
              <button role="tab" aria-selected={view === 'env'} onClick={() => setView('env')}>
                env
              </button>
              <button role="tab" aria-selected={view === 'raw'} onClick={() => setView('raw')}>
                raw
              </button>
            </div>
          )}
          <span role="alert" className="t-error">
            {err && `error: ${err}`}
          </span>
        </div>

        {!revealed ? (
          <div className="masked" aria-label="value hidden">
            {MASK}
          </div>
        ) : revealed.text === null ? (
          <div className="muted">
            # binary value · <span className="t-number">{revealed.size}</span> bytes — not shown as text.
          </div>
        ) : view === 'env' && env ? (
          <div className="tablewrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>key</th>
                  <th>value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {env.map((l, i) =>
                  l.kind === 'pair' ? (
                    <tr key={i}>
                      <td className="t-keyword">{l.key}</td>
                      <td className="t-string" style={{ overflowWrap: 'anywhere' }}>
                        {l.value}
                      </td>
                      <td>
                        <button className="link" onClick={() => copy(l.value)} aria-label={`copy ${l.key}`}>
                          copy
                        </button>
                      </td>
                    </tr>
                  ) : l.raw.trim() === '' ? null : (
                    <tr key={i}>
                      <td colSpan={3} className="muted">
                        {l.raw}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="value">{revealed.text}</pre>
        )}
        {revealed && (
          <div className="muted small">
            # <span className="t-number">{revealed.size}</span> bytes · hidden again after 60s<span className="on-keys"> or esc</span>.
          </div>
        )}
      </div>

      <div className="card">
        <h2>
          versions <span className="muted">— newest first</span>
        </h2>
        {verErr ? (
          <div className="muted"># unavailable — see the error above.</div>
        ) : versions === null ? (
          <div className="muted"># loading…</div>
        ) : (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>{base.backend === 'storage' ? 'generation' : 'version'}</th>
                    <th>updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const id = versionOf(v)
                    const active = v === shown
                    return (
                      <tr key={id} className={active ? 'active' : undefined}>
                        <td className="t-prompt">{active ? '▶' : ''}</td>
                        <td className="t-number">{id}</td>
                        <td className="muted">{stamp(v.updatedAt)}</td>
                        <td>
                          {!active && (
                            <button className="link" onClick={() => pickVersion(id)}>
                              view
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {base.backend === 'storage' && versions.length <= 1 && (
              <div className="muted small"># only the live generation exists. older generations are kept only if object versioning is on for the bucket.</div>
            )}
          </>
        )}
      </div>
    </>
  )
}
