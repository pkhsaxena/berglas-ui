import { type ReactNode, useState } from 'react'
import { type Ref, refString } from '../../../core/api'
import { type KeyChange, matchAgainst } from '../../../core/diff'
import { looksLikeEnv } from '../../../core/envfile'
import { type Section, sortEnv } from '../../../core/envsort'
import type { EnvTone } from '../../../core/envtone'
import type { useEditor } from '../../../core/hooks/useEditor'
import { useKeyInput } from '../../../core/hooks/useKeyInput'
import { useAutoGrow } from '../../../core/hooks/useAutoGrow'
import type { Pinned } from '../../../core/hooks/usePinned'
import { CONFIRM_WORD, typedConfirm, protectedFor, readOnlyFor, useSettings } from '../../../core/settings'
import { ConfirmName, EnvBadge, EnvBanner, EnvPair, ErrorText, PaneHead } from './bits'
import { DiffView } from './DiffView'
import { EnvWarnings } from './EnvWarnings'
import { EnvRows, OrderToggle } from './EnvRows'
import { Select } from './Select'

// a value, wrapping onto more lines as it grows instead of being cut off (see useAutoGrow); Enter adds no line break, since values can't span lines
function ValueField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useAutoGrow(value)
  return (
    <textarea
      ref={ref}
      className="value-field"
      rows={1}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      spellCheck={false}
      autoComplete="off"
    />
  )
}

// a key name, editable in place (see useKeyInput); keys the loaded version doesn't have are marked new
function KeyInput({ k, rename, isNew }: { k: string; rename: (key: string) => string; isNew: boolean }) {
  const { inputProps, error } = useKeyInput(k, rename)
  return (
    <>
      <span className="key-edit">
        <input className="key-input" aria-label={`name of ${k}`} {...inputProps} />
        {isNew && <span className="new-badge">new</span>}
      </span>
      {error && <div className="bad-text small key-error">{error}</div>}
    </>
  )
}

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
  const ref = pinned?.value?.env && pinned.value.text !== null ? pinned.value.text : null
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
                      tail={ed.addedKeys}
                      cols={vs ? 4 : 3}
                      renderPair={(l, i) => (
                        <tr key={i} className={ed.isNewKey(l.key) ? 'env-new' : undefined}>
                          <td className="env-key">
                            <KeyInput k={l.key} rename={(key) => ed.edits.renameKey(i, key)} isNew={ed.isNewKey(l.key)} />
                          </td>
                          <td className="input-cell" style={{ width: '100%' }}>
                            <ValueField label={`value of ${l.key}`} value={l.value} onChange={(v) => ed.edits.setLineValue(i, v)} />
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
                    <div className="row pin-missing-head">
                      <h3 style={{ margin: 0 }}>Only in pinned</h3>
                      <button className="link" onClick={() => ed.edits.setKeys(vs.missing)}>
                        Add all {vs.missing.length}
                      </button>
                    </div>
                    <ul className="clean pin-missing">
                      {vs.missing.map((m) => (
                        <li key={m.key}>
                          <EnvPair k={m.key} v={m.value} />
                          <button className="link" onClick={() => ed.edits.setKeys([m])} aria-label={`add ${m.key} from pinned`}>
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
                      <Select ariaLabel="section for the new key" value={section} options={[{ value: '', label: 'End of file' }, ...sections]} onChange={setSection} />
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
              {ed.unchanged && (
                <button className="btn" onClick={ed.resave} title="Write the same value again as a new version, so whatever watches for new versions picks it up">
                  Save unchanged…
                </button>
              )}
              <button className="btn" onClick={ed.cancel}>
                Cancel
              </button>
              <ErrorText>{ed.error}</ErrorText>
            </div>
            <div className="muted small">
              Nothing is saved until you review the diff and press Save.{ed.unchanged && ' Save unchanged writes the same value again as a new version.'}
            </div>
          </>
        )}

        {(ed.phase === 'review' || ed.phase === 'saving') && ed.diff && (
          <div className="section">
            <h3>Review</h3>
            <div className="muted small">#{ed.loadedVersion} → a new version. Saving writes exactly this; nothing has been written yet.</div>
            {ed.unchanged && (
              <div className="warn-text" style={{ margin: '6px 0' }}>
                Nothing changed: saving writes the same value again as a new version. Anything that watches for new versions, such as a cluster's secret sync, picks it up again.
              </div>
            )}
            {ed.overlaps.length > 0 && (
              <div className="bad-text" style={{ margin: '6px 0' }}>
                Someone else also changed {ed.overlaps.join(', ')} — your value{ed.overlaps.length > 1 ? 's' : ''} will replace theirs.
              </div>
            )}
            <EnvWarnings warnings={ed.warnings} />
            <DiffView diff={ed.diff} />
            {isProtected && <ConfirmName name={base.name} word={CONFIRM_WORD} value={typed} onChange={setTyped} why={tone === 'prod' ? 'This is a protected production secret.' : 'This name is protected by config.'} />}
            <div className="row">
              <button className={tone === 'prod' ? 'btn prod' : 'btn primary'} onClick={() => ed.save(isProtected ? base.name : undefined)} disabled={ed.phase === 'saving' || (isProtected && !typedConfirm(typed))}>
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
