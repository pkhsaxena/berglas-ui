import { type ReactNode, useState } from 'react'
import { type Ref, refString } from '../../../core/api'
import { type KeyChange, matchAgainst } from '../../../core/diff'
import { looksLikeEnv } from '../../../core/envfile'
import type { useEditor } from '../../../core/hooks/useEditor'
import type { Pinned } from '../../../core/hooks/usePinned'
import { type Section, sortEnv } from '../../../core/envsort'
import { protectedFor, useSettings } from '../../../core/settings'
import { ConfirmName } from './ConfirmName'
import { DiffView } from './DiffView'
import { EnvRows, OrderToggle } from './EnvRows'
import { PaneTitle } from './PaneTitle'

// a section's id in the picker: its header line, or '-' for the no-section group
const sectionValue = (x: Section) => (x.header[0]?.raw ?? '-')

type Props = {
  base: Ref
  ed: ReturnType<typeof useEditor>
  /** a pinned .env secret to line keys up against and copy values from */
  pinned?: Pinned | null
  /** view tabs, shown in the title border */
  titleTabs?: ReactNode
}

export function Editor({ base, ed, pinned, titleTabs }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addErr, setAddErr] = useState('')
  const [typed, setTyped] = useState('')
  const [section, setSection] = useState('') // '' = end of file
  const { envOrder } = useSettings()
  const isProtected = protectedFor(useSettings(), base)

  if (ed.phase === 'idle') return null
  if (ed.phase === 'loading') {
    return (
      <div className="card">
        <PaneTitle tabs={titleTabs}>edit</PaneTitle>
        <div className="muted"># decrypting the latest version…</div>
      </div>
    )
  }

  const target = refString({ ...base, version: undefined })
  const envAvailable = looksLikeEnv(ed.draft)
  // sections a new key can go into, named by their header ("Server") or "no section"
  const sections = envAvailable
    ? sortEnv(ed.draft).sections.map((x) => ({ value: sectionValue(x), label: x.title ? `# ${x.title}` : 'no section' }))
    : []
  const ref = pinned?.value.env && pinned.value.text !== null ? pinned.value.text : null
  const vs = ref !== null && envAvailable ? matchAgainst(ed.draft, ref) : null

  // how one key compares with the pinned secret: = same, ≠ differs (with a
  // one-click copy of the pinned value), + only in this secret
  const pinMark = (c: KeyChange | undefined, line: number) => {
    if (!c) return null
    if (c.kind === 'same') return <span className="t-function" title="same as pinned">=</span>
    if (c.kind === 'removed') return <span className="muted" title="not in the pinned secret">+ only here</span>
    if (c.kind === 'changed')
      return (
        <>
          <span className="t-keyword" title="differs from pinned">≠ </span>
          <button className="link" onClick={() => ed.edits.setLineValue(line, c.after)} title={`set to the pinned value`}>
            use pinned
          </button>
        </>
      )
    return null
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    // the section is chosen by name and resolved now, since line numbers move as the draft changes
    const target = section ? sortEnv(ed.draft).sections.find((x) => sectionValue(x) === section) : undefined
    const msg = ed.edits.addKey(newKey, newValue, target?.lastKeyIndex)
    setAddErr(msg)
    if (!msg) {
      setNewKey('')
      setNewValue('')
    }
  }

  return (
    <div className="card pane">
      <PaneTitle tabs={titleTabs}>
        edit <span className="muted">— {base.name}</span>
      </PaneTitle>
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
              {ed.mode === 'env' && <OrderToggle />}
              <span className="muted small">
                {ed.mode === 'env'
                  ? envOrder === 'sorted'
                    ? '# shown sorted; saving keeps the file order, editing a value rewrites only its own line.'
                    : '# editing a value rewrites only its own line.'
                  : '# the whole value, exactly as stored.'}
              </span>
            </div>
            {vs && (
              <div className={vs.matches ? 't-function' : 'muted small'}>
                {vs.matches
                  ? `✓ matches pinned ${pinned!.ref.name} exactly`
                  : `# vs pinned ${pinned!.ref.name}: ${vs.differ} differ · ${vs.missing.length} missing · ${vs.extra} only here`}
              </div>
            )}

            {ed.mode === 'env' && ed.env ? (
              <>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>key</th>
                        <th>value</th>
                        {vs && <th title={`compared with pinned ${pinned!.ref.name}`}>pinned</th>}
                        <th />
                      </tr>
                    </thead>
                    <EnvRows
                      text={ed.draft}
                      order={envOrder}
                      cols={vs ? 4 : 3}
                      renderPair={(l, i) => (
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
                          {vs && <td style={{ whiteSpace: 'nowrap' }}>{pinMark(vs.byKey.get(l.key), i)}</td>}
                          <td>
                            <button className="link" onClick={() => ed.edits.removeLine(i)} aria-label={`remove ${l.key}`}>
                              remove
                            </button>
                          </td>
                        </tr>
                      )}
                    />
                  </table>
                </div>
                {vs && vs.missing.length > 0 && (
                  <div className="section">
                    <div className="row" style={{ margin: 0 }}>
                      <span className="t-keyword">only in pinned</span>
                      <button className="link" onClick={() => ed.edits.setKeys(vs.missing)}>
                        add all {vs.missing.length}
                      </button>
                    </div>
                    <ul className="clean">
                      {vs.missing.map((m) => (
                        <li key={m.key} className="kv">
                          <span>
                            <span className="t-keyword">{m.key}</span> <span className="t-string">{m.value}</span>
                          </span>
                          <button className="link" onClick={() => ed.edits.setKeys([m])} aria-label={`add ${m.key} from pinned`}>
                            add
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <form className="row" onSubmit={add}>
                  <input aria-label="new key" placeholder="NEW_KEY" value={newKey} onChange={(e) => setNewKey(e.target.value)} spellCheck={false} autoComplete="off" style={{ flex: '0 1 22ch' }} />
                  <input aria-label="new value" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} spellCheck={false} autoComplete="off" />
                  {sections.length > 0 && (
                    <label className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      in
                      <select aria-label="section for the new key" value={section} onChange={(e) => setSection(e.target.value)}>
                        <option value="">end of file</option>
                        {sections.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
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
