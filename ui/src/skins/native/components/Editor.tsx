import { type ReactNode, useState } from 'react'
import { type Ref, refString } from '../../../core/api'
import { type KeyChange, matchAgainst } from '../../../core/diff'
import { looksLikeEnv } from '../../../core/envfile'
import { type Section, sortEnv } from '../../../core/envsort'
import type { EnvTone } from '../../../core/envtone'
import type { useEditor } from '../../../core/hooks/useEditor'
import type { Pinned } from '../../../core/hooks/usePinned'
import { protectedFor, readOnlyFor, useSettings } from '../../../core/settings'
import { ConfirmName, EnvBadge, EnvBanner, ErrorText, KeyText, PaneHead } from './bits'
import { DiffView } from './DiffView'
import { EnvRows, OrderToggle } from './EnvRows'

// a section's id in the picker: its header line, or '-' for the no-section group
const sectionValue = (x: Section) => x.header[0]?.raw ?? '-'

type Props = {
  base: Ref
  ed: ReturnType<typeof useEditor>
  /** a pinned .env secret to line keys up against and copy values from */
  pinned?: Pinned | null
  /** view tabs, shown in the header */
  titleTabs?: ReactNode
  tone: EnvTone | null
}

export function Editor({ base, ed, pinned, titleTabs, tone }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addErr, setAddErr] = useState('')
  const [typed, setTyped] = useState('')
  const [section, setSection] = useState('') // '' = end of file
  const settings = useSettings()
  const { envOrder } = settings
  const isProtected = protectedFor(settings, base)
  const readOnly = readOnlyFor(settings, base)

  if (ed.phase === 'idle') return null
  const head = (
    <>
      <EnvBanner tone={tone} isProtected={isProtected} readOnly={readOnly} />
      <PaneHead
        tabs={titleTabs}
        title={
          <>
            Edit · <span className="mono">{base.name}</span>
          </>
        }
        actions={<EnvBadge tone={tone} />}
      />
    </>
  )
  if (ed.phase === 'loading') {
    return (
      <div className="pane">
        {head}
        <div className="body muted">Decrypting the latest version…</div>
      </div>
    )
  }

  const target = refString({ ...base, version: undefined })
  const envAvailable = looksLikeEnv(ed.draft)
  const sections = envAvailable ? sortEnv(ed.draft).sections.map((x) => ({ value: sectionValue(x), label: x.title || 'No section' })) : []
  const ref = pinned?.value.env && pinned.value.text !== null ? pinned.value.text : null
  const vs = ref !== null && envAvailable ? matchAgainst(ed.draft, ref) : null

  const pinMark = (c: KeyChange | undefined, line: number) => {
    if (!c) return null
    if (c.kind === 'same') return <span className="good-text" title="same as pinned">=</span>
    if (c.kind === 'removed') return <span className="muted" title="not in the pinned secret">+ only here</span>
    if (c.kind === 'changed')
      return (
        <>
          {c.quotesOnly ? (
            <span className="muted" title={`same value, only the quotes differ (pinned: ${c.after})`}>
              ≈ quotes{' '}
            </span>
          ) : (
            <span className="warn-text" title="differs from pinned">
              ≠{' '}
            </span>
          )}
          <button className="link" onClick={() => ed.edits.setLineValue(line, c.after)} title="set to the pinned value">
            Use pinned
          </button>
        </>
      )
    return null
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const at = section ? sortEnv(ed.draft).sections.find((x) => sectionValue(x) === section) : undefined
    const msg = ed.edits.addKey(newKey, newValue, at?.lastKeyIndex)
    setAddErr(msg)
    if (!msg) {
      setNewKey('')
      setNewValue('')
    }
  }

  return (
    <div className="pane">
      {head}
      <div className="body">
        <div className="muted small">
          {ed.fromFile ? `Replacing #${ed.loadedVersion} with the dropped file ${ed.fromFile}. Review the changes before saving.` : ed.restoredFrom ? `Restoring #${ed.restoredFrom} over the latest, #${ed.loadedVersion}.` : `Editing #${ed.loadedVersion} of ${target}.`}
        </div>

        {ed.phase === 'editing' && (
          <>
            <div className="row">
              <div className="seg" role="tablist" aria-label="editor mode">
                <button role="tab" aria-selected={ed.mode === 'env'} disabled={!envAvailable} onClick={() => ed.setMode('env')}>
                  Keys
                </button>
                <button role="tab" aria-selected={ed.mode === 'raw'} onClick={() => ed.setMode('raw')}>
                  Raw
                </button>
              </div>
              {ed.mode === 'env' && <OrderToggle />}
              <span className="muted small">
                {ed.mode === 'env'
                  ? envOrder === 'sorted'
                    ? 'Shown sorted; saving keeps the file order, and editing a value rewrites only its own line.'
                    : 'Editing a value rewrites only its own line.'
                  : 'The whole value, exactly as stored.'}
              </span>
            </div>
            {vs && (
              <div className={vs.matches || vs.matchesUnquoted ? 'good-text' : 'muted small'} style={{ marginBottom: 8 }}>
                {vs.matches
                  ? `✓ Matches pinned ${pinned!.ref.name} exactly`
                  : vs.matchesUnquoted
                    ? `✓ Matches pinned ${pinned!.ref.name} apart from quoting on ${vs.quotesOnly} key${vs.quotesOnly === 1 ? '' : 's'} (≈)`
                    : `Compared with pinned ${pinned!.ref.name}: ${vs.differ - vs.quotesOnly} differ${vs.quotesOnly ? ` · ${vs.quotesOnly} only by quotes` : ''} · ${vs.missing.length} missing · ${vs.extra} only here`}
              </div>
            )}

            {ed.mode === 'env' && ed.env ? (
              <>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                        {vs && <th title={`compared with pinned ${pinned!.ref.name}`}>vs pinned</th>}
                        <th />
                      </tr>
                    </thead>
                    <EnvRows
                      text={ed.draft}
                      order={envOrder}
                      cols={vs ? 4 : 3}
                      renderPair={(l, i) => (
                        <tr key={i}>
                          <td className="env-key">
                            <KeyText k={l.key} />
                          </td>
                          <td className="input-cell" style={{ width: '100%' }}>
                            <input aria-label={`value of ${l.key}`} value={l.value} onChange={(e) => ed.edits.setLineValue(i, e.target.value)} spellCheck={false} autoComplete="off" />
                          </td>
                          {vs && <td className="marks">{pinMark(vs.byKey.get(l.key), i)}</td>}
                          <td>
                            <button className="link" onClick={() => ed.edits.removeLine(i)} aria-label={`remove ${l.key}`}>
                              Remove
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
                      <h3 style={{ margin: 0 }}>Only in pinned</h3>
                      <button className="link" onClick={() => ed.edits.setKeys(vs.missing)}>
                        Add all {vs.missing.length}
                      </button>
                    </div>
                    <ul className="clean">
                      {vs.missing.map((m) => (
                        <li key={m.key} className="kv">
                          <span className="mono">
                            {m.key}={m.value}
                          </span>
                          <button className="link" style={{ justifySelf: 'start' }} onClick={() => ed.edits.setKeys([m])} aria-label={`add ${m.key} from pinned`}>
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <form className="row" onSubmit={add}>
                  <input aria-label="new key" placeholder="NEW_KEY" value={newKey} onChange={(e) => setNewKey(e.target.value)} spellCheck={false} autoComplete="off" style={{ flex: '0 1 22ch' }} className="mono" />
                  <input aria-label="new value" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} spellCheck={false} autoComplete="off" className="mono" />
                  {sections.length > 0 && (
                    <label className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      in
                      <select aria-label="section for the new key" value={section} onChange={(e) => setSection(e.target.value)}>
                        <option value="">End of file</option>
                        {sections.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button className="btn" type="submit">
                    Add key
                  </button>
                  <ErrorText>{addErr}</ErrorText>
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

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={ed.review}>
                Review changes
              </button>
              <button className="btn" onClick={ed.cancel}>
                Cancel
              </button>
              <ErrorText>{ed.error}</ErrorText>
            </div>
            <div className="muted small">Nothing is saved until you review the diff and press Save.</div>
          </>
        )}

        {(ed.phase === 'review' || ed.phase === 'saving') && ed.diff && (
          <div className="section">
            <h3>Review</h3>
            <div className="muted small">#{ed.loadedVersion} → a new version. Saving writes exactly this; nothing has been written yet.</div>
            {ed.overlaps.length > 0 && (
              <div className="bad-text" style={{ margin: '6px 0' }}>
                Someone else also changed {ed.overlaps.join(', ')} — your value{ed.overlaps.length > 1 ? 's' : ''} will replace theirs.
              </div>
            )}
            <DiffView diff={ed.diff} />
            {isProtected && <ConfirmName name={base.name} value={typed} onChange={setTyped} why={tone === 'prod' ? 'This is a protected production secret.' : 'This name is protected by config.'} />}
            <div className="row">
              <button className={tone === 'prod' ? 'btn prod' : 'btn primary'} onClick={() => ed.save(isProtected ? typed : undefined)} disabled={ed.phase === 'saving' || (isProtected && typed !== base.name)}>
                {ed.phase === 'saving' ? 'Saving…' : tone === 'prod' ? 'Save to production' : 'Save'}
              </button>
              <button className="btn" onClick={ed.backToEdit} disabled={ed.phase === 'saving'}>
                Back to edit
              </button>
              <button className="btn" onClick={ed.cancel} disabled={ed.phase === 'saving'}>
                Cancel
              </button>
              <ErrorText>{ed.error}</ErrorText>
            </div>
            <div className="muted small">Saves to {target}.</div>
          </div>
        )}

        {ed.phase === 'conflict' && (
          <div className="section danger">
            <h3 className="bad-text">Not saved — {ed.error}</h3>
            <div>Someone saved a newer version after you loaded #{ed.loadedVersion}. Saving now would undo their change, so it was refused.</div>
            <div className="row">
              {ed.canReapply && (
                <button className="btn primary" onClick={ed.reapply}>
                  Reapply my changes to the latest
                </button>
              )}
              <button className="btn" onClick={ed.restart}>
                Start over from the latest
              </button>
              <button className="btn" onClick={ed.cancel}>
                Cancel
              </button>
            </div>
            {ed.canReapply && <div className="muted small">Reapply replays only the keys you changed onto the newest version, then shows the review again.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
