import type { Backend } from '../../../core/api'
import { DEFAULT_AUDIT_LOG, LOCK_CHOICES, type Setup as SetupState, type SetupStep } from '../../../core/hooks/useSetup'
import { GROUP_PRESETS, groupFit, type SetupRow } from '../../../core/setup'
import { ErrorText } from './bits'
import { Select } from './Select'
import { Switch } from './Settings'

const STEPS: { id: SetupStep; title: string }[] = [
  { id: 'sources', title: 'Sources' },
  { id: 'safety', title: 'Safety' },
  { id: 'review', title: 'Review' },
]

const KINDS = [
  { value: 'storage', label: 'Storage + KMS' },
  { value: 'sm', label: 'Secret Manager' },
]

const lockLabel = (m: number) => (m === 0 ? 'Never' : `After ${m} min`)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The setup guide: shown on a fresh install (no sources), and from ⌘K or the sources pane later. */
export function Setup({ s, configPath }: { s: SetupState; configPath: string }) {
  if (!s.open) return null
  const at = STEPS.findIndex((x) => x.id === s.step)
  return (
    <div className="palette-backdrop settings-backdrop" data-find-ignore>
      <div
        className="settings setup"
        role="dialog"
        aria-modal="true"
        aria-label="set up berglas-ui"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !s.saving) {
            e.stopPropagation()
            s.close()
          }
        }}
      >
        <div className="settings-head">
          <h2>Set up berglas-ui</h2>
          <ol className="setup-steps" aria-label="steps">
            {STEPS.map((x, i) => (
              <li key={x.id} aria-current={x.id === s.step ? 'step' : undefined} className={i < at ? 'done' : undefined}>
                <span className="setup-num">{i < at ? '✓' : i + 1}</span> {x.title}
              </li>
            ))}
          </ol>
          <span className="spacer" />
          <button className="btn" onClick={s.close} disabled={s.saving} title="Close; sources can be added later from the sources pane or ⌘K">
            Skip for now
          </button>
        </div>
        <div className="settings-body setup-body">
          {s.step === 'sources' && <SourcesStep s={s} />}
          {s.step === 'safety' && <SafetyStep s={s} />}
          {s.step === 'review' && <ReviewStep s={s} configPath={configPath} />}
        </div>
        <div className="setup-foot">
          <ErrorText>{s.error}</ErrorText>
          <span className="spacer" />
          {s.step !== 'sources' && (
            <button className="btn" onClick={s.back} disabled={s.saving}>
              Back
            </button>
          )}
          {s.step === 'review' ? (
            <button className="btn primary" onClick={() => void s.save()} disabled={s.saving || !s.newSources.length}>
              {s.saving ? 'Saving…' : `Save and open ${s.newSources[0]?.label || s.newSources[0]?.parent || ''}`}
            </button>
          ) : (
            <button className="btn primary" onClick={s.next} disabled={s.step === 'sources' && !s.canNext}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckLine({ s, r }: { s: SetupState; r: SetupRow }) {
  const c = s.checkOf(r)
  if (!c) return <span className="muted small">Checked once the name is complete.</span>
  if (c.state === 'checking') return <span className="muted small">Listing…</span>
  if (c.state === 'error') return <span className="bad-text small">Couldn't list it — {c.error}. It can still be added.</span>
  return <span className="good-text small">✓ Reachable · {plural(c.names.length, 'secret')}</span>
}

function GroupLine({ s, r }: { s: SetupState; r: SetupRow }) {
  const names = s.namesOf(r)
  if (!r.group.trim()) return <span className="muted small">No grouping: the list is one flat list of names.</span>
  if (!names.length) return <span className="muted small">The first placeholder groups the list; the second names the environment.</span>
  const f = groupFit(r.group.trim(), names)
  return (
    <span className="muted small">
      {f.matched} of {f.total} names fit
      {f.groups.length > 0 && ` · groups: ${f.groups.slice(0, 6).join(', ')}${f.groups.length > 6 ? ` +${f.groups.length - 6}` : ''}`}
      {f.envs.length > 0 && ` · environments: ${f.envs.slice(0, 6).join(', ')}`}
    </span>
  )
}

function SourcesStep({ s }: { s: SetupState }) {
  return (
    <>
      <p className="setup-intro">
        Add the buckets (Cloud Storage + KMS) and projects (Secret Manager) that hold your secrets — as many as you like. Each one is listed as soon as its name is complete, to check you can reach it and to suggest how its names group. Listing reads names only, never values.
      </p>
      <datalist id="setup-groups">
        {GROUP_PRESETS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {s.rows.map((r, i) => (
        <fieldset key={r.key} className="setup-row" aria-label={`source ${i + 1}`}>
          <div className="row">
            <Select ariaLabel={`source ${i + 1} kind`} value={r.backend} options={KINDS} onChange={(v) => s.update(r.key, { backend: v as Backend })} />
            <input
              className="set-wide"
              aria-label={`source ${i + 1} ${r.backend === 'storage' ? 'bucket name' : 'project id'}`}
              aria-invalid={!!s.errors[i] && !!r.parent.trim()}
              placeholder={r.backend === 'storage' ? 'bucket name' : 'project id'}
              value={r.parent}
              onChange={(e) => s.update(r.key, { parent: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              autoFocus={i === s.rows.length - 1 && !r.parent}
            />
            <input aria-label={`source ${i + 1} label`} placeholder="label (optional)" value={r.label} onChange={(e) => s.update(r.key, { label: e.target.value })} autoComplete="off" spellCheck={false} />
            <button className="icon-btn" onClick={() => s.removeRow(r.key)} aria-label={`remove source ${i + 1}`} title="Remove this row">
              ✕
            </button>
          </div>
          {r.parent.trim() && s.errors[i] ? <ErrorText>{s.errors[i]}</ErrorText> : r.parent.trim() && <CheckLine s={s} r={r} />}
          <div className="setup-grid">
            <label htmlFor={`setup-group-${r.key}`}>Group names by</label>
            <div>
              <input
                id={`setup-group-${r.key}`}
                list="setup-groups"
                placeholder="{service}-{env}-env"
                value={r.group}
                onChange={(e) => s.update(r.key, { group: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              <GroupLine s={s} r={r} />
            </div>
            {r.backend === 'storage' && (
              <>
                <label htmlFor={`setup-kms-${r.key}`}>KMS key for new secrets</label>
                <div>
                  <input
                    id={`setup-kms-${r.key}`}
                    placeholder="projects/…/locations/…/keyRings/…/cryptoKeys/… (optional)"
                    value={r.kmsKey}
                    onChange={(e) => s.update(r.key, { kmsKey: e.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </>
            )}
            <span>Read-only</span>
            <div className="row">
              <Switch on={r.readOnly} label={`source ${i + 1} read-only`} onChange={(on) => s.update(r.key, { readOnly: on })} />
              <span className="muted small">Refuse every write to this source.</span>
            </div>
          </div>
        </fieldset>
      ))}
      <div className="row">
        <button className="btn" onClick={() => s.addRow()}>
          + Add another
        </button>
      </div>
      <details className="setup-paste">
        <summary>Paste a list</summary>
        <div className="muted small">One per line (commas work too): berglas://bucket, gs://bucket, sm://project or projects/project. Bare names are taken as:</div>
        <div className="row">
          <Select ariaLabel="kind for bare names" value={s.pasteKind} options={KINDS} onChange={(v) => s.setPasteKind(v as Backend)} />
        </div>
        <textarea aria-label="paste sources" rows={4} value={s.paste} onChange={(e) => s.setPaste(e.target.value)} spellCheck={false} placeholder={'berglas://my-bucket\nsm://my-project'} />
        <div className="row">
          <button className="btn" onClick={s.addPasted} disabled={!s.paste.trim()}>
            Add these
          </button>
          {s.pasteNote && <span className="muted small">{s.pasteNote}</span>}
        </div>
      </details>
    </>
  )
}

function SafetyStep({ s }: { s: SetupState }) {
  return (
    <>
      <section aria-label="protected names">
        <h3>Protected names</h3>
        <p className="setup-intro">
          Saving a protected secret, or saving it to a file, asks for the word “confirm” to be typed (deleting any secret always does). Patterns use * and ?, like *-prod-*. They apply to every source.
        </p>
        {s.protect.length === 0 ? (
          <div className="muted small">None yet.</div>
        ) : (
          <ul className="clean setup-chips">
            {s.protect.map((p) => {
              const n = s.countFor(p)
              return (
                <li key={p} className="setup-chip">
                  <span className="mono">{p}</span>
                  {n !== null && <span className="muted small">{plural(n, 'secret')}</span>}
                  <button className="icon-btn" onClick={() => s.removeProtect(p)} aria-label={`remove ${p}`}>
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            s.addProtect()
          }}
        >
          <input className="set-wide mono" aria-label="protected name pattern" placeholder="*-prod-*" value={s.protectDraft} onChange={(e) => s.setProtectDraft(e.target.value)} autoComplete="off" spellCheck={false} />
          <button className="btn" type="submit">
            Add
          </button>
          <ErrorText>{s.protectNote}</ErrorText>
        </form>
        {s.suggestions.length > 0 && (
          <div className="row setup-suggest">
            <span className="muted small">Suggested:</span>
            {s.suggestions.map((p) => {
              const n = s.countFor(p)
              return (
                <button key={p} className="btn small-btn" onClick={() => s.addProtect(p)} title={`Protect names matching ${p}`}>
                  + <span className="mono">{p}</span>
                  {n !== null && ` · ${n}`}
                </button>
              )
            })}
          </div>
        )}
      </section>
      <section aria-label="lock">
        <h3>Lock</h3>
        <div className="row">
          <span>Lock the app when idle</span>
          <Select ariaLabel="lock after" value={String(s.lockAfterMinutes)} options={LOCK_CHOICES.map((m) => ({ value: String(m), label: lockLabel(m) }))} onChange={(v) => s.setLockAfterMinutes(Number(v))} />
        </div>
        <div className="muted small">Unlocking asks for Touch ID or your login password in the mac app.</div>
      </section>
      <section aria-label="audit log">
        <h3>Audit log</h3>
        {s.auditFixed ? (
          <div className="muted small">Already kept at {s.auditLog}.</div>
        ) : s.demo ? (
          <div className="muted small">Not offered in the demo: it would write to the real audit log in your home folder. Turn it on in Settings once you use real sources.</div>
        ) : (
          <div className="row">
            <Switch on={s.audit} label="keep an audit log" onChange={s.setAudit} />
            <span>
              Keep one line per write at <span className="mono">{DEFAULT_AUDIT_LOG}</span> <span className="muted small">(names and who, never values)</span>
            </span>
          </div>
        )}
      </section>
    </>
  )
}

function ReviewStep({ s, configPath }: { s: SetupState; configPath: string }) {
  return (
    <>
      <p className="setup-intro">Nothing is saved yet. Save writes all of this to the config in one go{configPath ? ` (${configPath})` : ''}; every part can be changed later in Settings (⌘,).</p>
      <section aria-label="sources to add">
        <h3>{plural(s.newSources.length, 'source')} to add</h3>
        <ul className="clean setup-review">
          {s.newSources.map((src) => (
            <li key={`${src.backend}:${src.parent}`}>
              <span className="mono">
                {src.backend === 'storage' ? 'berglas://' : 'sm://'}
                {src.parent}
              </span>
              {src.label && <span> · “{src.label}”</span>}
              <span className="muted small">
                {' '}
                · {src.group ? `grouped by ${src.group}` : 'not grouped'}
                {src.kmsKey ? ' · kms key set' : ''}
                {src.readOnly ? ' · read-only' : ''}
              </span>
            </li>
          ))}
        </ul>
        {s.unreachable.length > 0 && <div className="warn-text small">Couldn't list {s.unreachable.join(', ')} just now; they are added anyway and show the error when opened.</div>}
      </section>
      <section aria-label="safety">
        <h3>Safety</h3>
        <div>Protected names: {s.protect.length ? <span className="mono">{s.protect.join(', ')}</span> : <span className="muted">none</span>}</div>
        <div>Lock when idle: {lockLabel(s.lockAfterMinutes).toLowerCase()}</div>
        <div>Audit log: {s.auditLog ? <span className="mono">{s.auditLog}</span> : <span className="muted">off</span>}</div>
      </section>
    </>
  )
}
