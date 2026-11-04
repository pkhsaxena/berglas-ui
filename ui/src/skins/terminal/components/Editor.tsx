import { useState } from 'react'
import { type Ref, refString } from '../../../core/api'
import { looksLikeEnv } from '../../../core/envfile'
import type { useEditor } from '../../../core/hooks/useEditor'
import { protectedFor, useSettings } from '../../../core/settings'
import { ConfirmName } from './ConfirmName'
import { DiffView } from './DiffView'

type Props = { base: Ref; ed: ReturnType<typeof useEditor> }

export function Editor({ base, ed }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addErr, setAddErr] = useState('')
  const [typed, setTyped] = useState('')
  const isProtected = protectedFor(useSettings(), base)

  if (ed.phase === 'idle') return null
  if (ed.phase === 'loading') {
    return (
      <div className="card">
        <h2>edit</h2>
        <div className="muted"># decrypting the latest version…</div>
      </div>
    )
  }

  const target = refString({ ...base, version: undefined })
  const envAvailable = looksLikeEnv(ed.draft)

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = ed.edits.addKey(newKey, newValue)
    setAddErr(msg)
    if (!msg) {
      setNewKey('')
      setNewValue('')
    }
  }

  return (
    <div className="card pane">
      <h2>
        edit <span className="muted">— {base.name}</span>
      </h2>
      <div className="body">
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">edit</span> <span className="t-string">{target}</span>{' '}
          <span className="muted">
            {ed.restoredFrom ? `# restoring #${ed.restoredFrom} over latest #${ed.loadedVersion}` : `# from #${ed.loadedVersion}`}
          </span>
        </div>

        {ed.phase === 'editing' && (
          <>
            <div className="row">
              <div className="tabs" role="tablist" aria-label="editor mode">
                <button role="tab" aria-selected={ed.mode === 'env'} disabled={!envAvailable} onClick={() => ed.setMode('env')}>
                  env
                </button>
                <button role="tab" aria-selected={ed.mode === 'raw'} onClick={() => ed.setMode('raw')}>
                  raw
                </button>
              </div>
              <span className="muted small">
                {ed.mode === 'env' ? '# editing a value rewrites only its own line.' : '# the whole value, exactly as stored.'}
              </span>
            </div>

            {ed.mode === 'env' && ed.env ? (
              <>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>key</th>
                        <th>value</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ed.env.map((l, i) =>
                        l.kind === 'pair' ? (
                          <tr key={i}>
                            <td className="t-keyword" style={{ whiteSpace: 'nowrap' }}>
                              {l.key}
                            </td>
                            <td style={{ width: '100%' }}>
                              <input
                                aria-label={`value of ${l.key}`}
                                value={l.value}
                                onChange={(e) => ed.edits.setLineValue(i, e.target.value)}
                                spellCheck={false}
                                autoComplete="off"
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td>
                              <button className="link" onClick={() => ed.edits.removeLine(i)} aria-label={`remove ${l.key}`}>
                                remove
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
                <form className="row" onSubmit={add}>
                  <input aria-label="new key" placeholder="NEW_KEY" value={newKey} onChange={(e) => setNewKey(e.target.value)} spellCheck={false} autoComplete="off" style={{ flex: '0 1 22ch' }} />
                  <input aria-label="new value" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} spellCheck={false} autoComplete="off" />
                  <button type="submit">add key</button>
                  <span role="alert" className="t-error">
                    {addErr}
                  </span>
                </form>
              </>
            ) : (
              <textarea
                aria-label="secret value"
                value={ed.draft}
                onChange={(e) => ed.edits.setText(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                rows={Math.min(24, Math.max(6, ed.draft.split('\n').length + 1))}
                style={{ width: '100%', marginTop: 6, font: '12.5px/1.6 var(--mono)', whiteSpace: 'pre', overflowX: 'auto' }}
              />
            )}

            <div className="row">
              <button className="primary" onClick={ed.review}>
                review changes
              </button>
              <button onClick={ed.cancel}>cancel</button>
              <span role="alert" className="t-error">
                {ed.error && `error: ${ed.error}`}
              </span>
            </div>
            <div className="muted small"># nothing is saved until you review the diff and press save.</div>
          </>
        )}

        {(ed.phase === 'review' || ed.phase === 'saving') && ed.diff && (
          <>
            <div className="t-keyword" style={{ marginTop: 6 }}>
              review
            </div>
            <div className="muted small">
              # #{ed.loadedVersion} → new version. saving writes exactly this; nothing has been written yet.
            </div>
            {ed.overlaps.length > 0 && (
              <div className="t-error">
                warning: someone else also changed {ed.overlaps.join(', ')} — your value{ed.overlaps.length > 1 ? 's' : ''} will replace theirs.
              </div>
            )}
            <DiffView diff={ed.diff} />
            {isProtected && (
              <ConfirmName name={base.name} value={typed} onChange={setTyped} why="this name is protected by config." />
            )}
            <div className="row">
              <button
                className="primary"
                onClick={() => ed.save(isProtected ? typed : undefined)}
                disabled={ed.phase === 'saving' || (isProtected && typed !== base.name)}
              >
                {ed.phase === 'saving' ? 'saving…' : `save to ${target}`}
              </button>
              <button onClick={ed.backToEdit} disabled={ed.phase === 'saving'}>
                back to edit
              </button>
              <button onClick={ed.cancel} disabled={ed.phase === 'saving'}>
                cancel
              </button>
              <span role="alert" className="t-error">
                {ed.error && `error: ${ed.error}`}
              </span>
            </div>
          </>
        )}

        {ed.phase === 'conflict' && (
          <>
            <div role="alert" className="t-error" style={{ marginTop: 6 }}>
              error: not saved — {ed.error}
            </div>
            <div className="muted">
              # someone saved a newer version after you loaded #{ed.loadedVersion}. saving now would undo their change, so it was refused.
            </div>
            <div className="row">
              {ed.canReapply && (
                <button className="primary" onClick={ed.reapply}>
                  reapply my changes to latest
                </button>
              )}
              <button onClick={ed.restart}>start over from latest</button>
              <button onClick={ed.cancel}>cancel</button>
            </div>
            {ed.canReapply && <div className="muted small"># reapply replays only the keys you changed onto the newest version, then shows the review again.</div>}
          </>
        )}
      </div>
    </div>
  )
}
