import { type ReactNode, useEffect, useState } from 'react'
import { REPO_URL } from '../../../core/about'
import { type SettingsIdentity, type SettingsScreen, useFieldText } from '../../../core/hooks/useSettingsScreen'
import { type Block, type ChoiceKey, type ChoiceOption, type Field, type Item, isField, listText, parseList } from '../../../core/settingsModel'
import { type Source, sourceId, sourceName } from '../../../core/sources'
import { ErrorText } from './bits'
import { Select } from './Select'

type Props = {
  s: SettingsScreen
  sources: Source[]
  choices: Record<ChoiceKey, ChoiceOption[]>
  identity: SettingsIdentity
  /** where the config is saved, and the app's version */
  configPath: string
  version: string
}

type Typed = Extract<Field, { kind: 'number' | 'text' | 'list' }>

/** ⌘,: every setting in sections, with a search box. Safety settings are saved together from the bar at the bottom. */
export function Settings(p: Props) {
  const { s } = p
  if (!s.open) return null
  return (
    <div className="palette-backdrop settings-backdrop" data-find-ignore onMouseDown={(e) => e.target === e.currentTarget && s.close()}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="settings" onKeyDown={s.onKeyDown}>
        <div className="settings-head">
          <h2>Settings</h2>
          <input
            ref={s.searchRef}
            type="search"
            aria-label="search settings"
            placeholder="Search settings…"
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc clears a search first; the next one closes
              if (e.key === 'Escape' && s.query) {
                e.stopPropagation()
                s.setQuery('')
              }
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn" onClick={s.close}>
            Done
          </button>
        </div>
        <div className="settings-main">
          <nav className="settings-nav" aria-label="settings sections">
            {s.sections.map((sec) => (
              <button key={sec.id} onClick={() => document.getElementById(`settings-${sec.id}`)?.scrollIntoView({ block: 'start' })}>
                {sec.title}
              </button>
            ))}
          </nav>
          <div className="settings-body">
            {s.sections.map((sec) => (
              <section key={sec.id} id={`settings-${sec.id}`} aria-label={sec.title}>
                <h3>{sec.title}</h3>
                {sec.blurb && <div className="muted small settings-blurb">{sec.blurb}</div>}
                <div className="settings-rows">
                  {sec.items.map((it) => (
                    <ItemRow key={it.key} it={it} p={p} />
                  ))}
                </div>
              </section>
            ))}
            {s.sections.length === 0 && <div className="muted settings-empty">No settings match “{s.query}”.</div>}
          </div>
        </div>
        <SaveBar s={s} />
      </div>
    </div>
  )
}

function ItemRow({ it, p }: { it: Item; p: Props }) {
  if (isField(it)) return <FieldRow f={it} p={p} />
  return <BlockRow b={it} p={p} />
}

/** A setting's name and what it does, with its control on the right. */
function Row({ id, label, help, notes, error, children }: { id: string; label: ReactNode; help?: ReactNode; notes?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="set-row" data-setting={id}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {help && <div className="muted small">{help}</div>}
        {notes}
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="switch-knob" aria-hidden />
    </button>
  )
}

function FieldRow({ f, p }: { f: Field; p: Props }) {
  const { s } = p
  const notes = f.restart && (
    <div className={s.changed[f.key] ? 'warn-text small' : 'muted small'}>{s.changed[f.key] ? 'Saved. Restart the app for it to take effect.' : 'Takes effect after a restart.'}</div>
  )
  const help = (
    <>
      {f.help}
      {f.kind === 'number' && f.zero && ` 0 means ${f.zero}.`}
      {f.kind === 'text' && f.empty && ` Empty means ${f.empty}.`}
    </>
  )
  return (
    <Row id={f.key} label={f.label} help={help} notes={notes} error={s.errors[f.key]}>
      {f.kind === 'toggle' ? (
        <Switch on={s.value(f.key) as boolean} label={f.label} onChange={(on) => s.set(f.key, on as never)} />
      ) : f.kind === 'choice' ? (
        <Select
          ariaLabel={f.label}
          value={String(s.value(f.key))}
          options={p.choices[f.key as ChoiceKey]}
          onChange={(v) => s.set(f.key, (f.key === 'zoom' ? Number(v) : v) as never)}
        />
      ) : (
        <TypedField f={f} s={s} />
      )}
    </Row>
  )
}

/** A number, text or list setting. A safety one goes into the draft as typed; an ordinary one is saved on Enter or when focus leaves. */
function TypedField({ f, s }: { f: Typed; s: SettingsScreen }) {
  const t = useFieldText(s.textOf(f, s.value(f.key)), s.rev)
  const [own, setOwn] = useState('')
  useEffect(() => setOwn(''), [s.rev])
  const error = f.safety ? s.invalid[f.key] : own
  const commit = () => {
    const err = s.commit(f.key, t.text)
    setOwn(err)
    return !err
  }
  return (
    <span className="set-typed">
      <span className="row">
        <input
          aria-label={f.label}
          className={f.kind === 'number' ? 'set-number' : 'set-wide'}
          inputMode={f.kind === 'number' ? 'numeric' : undefined}
          value={t.text}
          placeholder={f.kind === 'number' ? undefined : f.placeholder}
          aria-invalid={!!error}
          onFocus={t.onFocus}
          onChange={(e) => {
            t.setText(e.target.value)
            setOwn(s.type(f.key, e.target.value))
          }}
          onBlur={() => t.onBlur(commit())}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          spellCheck={false}
          autoComplete="off"
        />
        {f.kind === 'number' && <span className="muted">{f.unit}</span>}
      </span>
      <ErrorText>{error}</ErrorText>
    </span>
  )
}

/** A text box saved on Enter or when focus leaves it. */
function CommitText({ label, value, rev, placeholder, onCommit }: { label: string; value: string; rev: number; placeholder?: string; onCommit: (text: string) => void }) {
  const t = useFieldText(value, rev)
  return (
    <input
      aria-label={label}
      className="set-wide"
      value={t.text}
      placeholder={placeholder}
      onFocus={t.onFocus}
      onChange={(e) => t.setText(e.target.value)}
      onBlur={() => {
        onCommit(t.text)
        t.onBlur(true)
      }}
      onKeyDown={(e) => e.key === 'Enter' && onCommit(t.text)}
      spellCheck={false}
      autoComplete="off"
    />
  )
}

function BlockRow({ b, p }: { b: Block; p: Props }) {
  const { s } = p
  if (b.key === 'about')
    return (
      <>
        <Row id="configFile" label="Config file" help="Every setting here is saved in this file. Edits made to it by hand are read when the app starts.">
          <span className="mono small set-path">{p.configPath}</span>
        </Row>
        <Row id="sourceCode" label="Source code" help="Issues, releases and the code.">
          <a className="mono small" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            {REPO_URL.replace('https://', '')}
          </a>
        </Row>
        <Row id="version" label="Version">
          <span className="mono small">{p.version}</span>
        </Row>
      </>
    )
  if (b.key === 'identity') return <IdentityBlock b={b} p={p} />
  if (p.sources.length === 0) return <Row id={b.key} label={b.label} help="No sources yet. Add one in the sources pane.">{null}</Row>
  if (b.key === 'sourceSafety')
    return (
      <>
        {p.sources.map((src) => {
          const v = s.sourceSafety(src)
          const name = sourceName(src)
          return (
            <Row key={sourceId(src)} id={`sourceSafety ${sourceId(src)}`} label={<SourceName src={src} />} help="Read-only refuses every write to this source. Its protected names add to the list above.">
              <span className="set-stack">
                <label className="row">
                  <span className="muted">Read-only</span>
                  <Switch on={v.readOnly} label={`${name} read-only`} onChange={(on) => s.setSourceSafety(src, { readOnly: on })} />
                </label>
                <SourceProtect s={s} src={src} protect={v.protect} />
              </span>
            </Row>
          )
        })}
      </>
    )
  return (
    <>
      {p.sources.map((src) => {
        const name = sourceName(src)
        return (
          <Row
            key={sourceId(src)}
            id={`source ${sourceId(src)}`}
            label={<SourceName src={src} />}
            help={src.backend === 'storage' ? 'Storage bucket (berglas://)' : 'Secret Manager project (sm://)'}
            error={s.errors[`source ${sourceId(src)}`]}
          >
            <span className="set-stack">
              <label className="row">
                <span className="muted">Label</span>
                <CommitText label={`${name} label`} value={src.label ?? ''} rev={s.rev} placeholder={src.parent} onCommit={(label) => s.setSourceDetail(src, { label })} />
              </label>
              {src.backend === 'storage' && (
                <label className="row" title="the default KMS key for new secrets in this bucket">
                  <span className="muted">KMS key</span>
                  <CommitText label={`${name} kms key`} value={src.kmsKey ?? ''} rev={s.rev} placeholder="projects/…/cryptoKeys/…" onCommit={(kmsKey) => s.setSourceDetail(src, { kmsKey })} />
                </label>
              )}
              <label className="row" title="a name pattern that groups the list by its first placeholder">
                <span className="muted">Group</span>
                <CommitText label={`${name} group`} value={src.group ?? ''} rev={s.rev} placeholder="{service}-{env}-env" onCommit={(group) => s.setSourceDetail(src, { group })} />
              </label>
              <label className="row" title="the source that opens when the app starts">
                <span className="muted">Opens at start</span>
                <Switch on={!!src.default} label={`${name} opens at start`} onChange={(on) => s.setSourceDetail(src, { default: on })} />
              </label>
            </span>
          </Row>
        )
      })}
    </>
  )
}

const SourceName = ({ src }: { src: Source }) => (
  <>
    {sourceName(src)}
    {src.label && <span className="muted mono small"> {src.parent}</span>}
  </>
)

/** A source's extra protected names; into the draft as typed. */
function SourceProtect({ s, src, protect }: { s: SettingsScreen; src: Source; protect: string[] }) {
  const t = useFieldText(listText(protect), s.rev)
  return (
    <label className="row">
      <span className="muted">Protected names</span>
      <input
        aria-label={`${sourceName(src)} protected names`}
        className="set-wide"
        value={t.text}
        placeholder="*-prod-*"
        onFocus={t.onFocus}
        onChange={(e) => {
          t.setText(e.target.value)
          s.setSourceSafety(src, { protect: parseList(e.target.value) })
        }}
        onBlur={() => t.onBlur(true)}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  )
}

function IdentityBlock({ b, p }: { b: Block; p: Props }) {
  const id = p.identity
  const [sa, setSa] = useState(id.serviceAccount)
  const [quota, setQuota] = useState(id.quotaProject)
  useEffect(() => {
    setSa(id.serviceAccount)
    setQuota(id.quotaProject)
  }, [id.serviceAccount, id.quotaProject])
  const edited = sa.trim() !== id.serviceAccount || quota.trim() !== id.quotaProject
  return (
    <>
      {id.options.length > 1 && (
        <Row id="identity" label={b.label} help={b.help}>
          <Select
            ariaLabel="settings act as"
            value={id.current}
            disabled={id.switching}
            options={id.options.map((o) => ({ value: o.key, label: o.label, hint: o.serviceAccount || undefined }))}
            onChange={(key) => {
              const o = id.options.find((x) => x.key === key)
              if (o) id.apply(o.serviceAccount, o.quotaProject)
            }}
          />
        </Row>
      )}
      <Row
        id="credentials"
        label="Service account and quota project"
        help="Make every call as this service account (empty: your own gcloud login), and bill API quota to this project. Switching reloads the lists and closes the open secret. The list of “act as” choices is edited in the config file (credentials.choices)."
        error={id.error}
      >
        <span className="set-stack">
          <label className="row">
            <span className="muted">Service account</span>
            <input aria-label="impersonate service account" className="set-wide" value={sa} placeholder="name@project.iam.gserviceaccount.com" onChange={(e) => setSa(e.target.value)} spellCheck={false} autoComplete="off" />
          </label>
          <label className="row">
            <span className="muted">Quota project</span>
            <input aria-label="quota project" className="set-wide" value={quota} placeholder="project id" onChange={(e) => setQuota(e.target.value)} spellCheck={false} autoComplete="off" />
          </label>
          <span className="row">
            <button className="btn" disabled={!edited || id.switching} onClick={() => id.apply(sa.trim(), quota.trim())}>
              {id.switching ? 'Switching…' : 'Switch identity'}
            </button>
          </span>
        </span>
      </Row>
    </>
  )
}

/** The pending safety changes: listed, then saved together after one confirmation. */
function SaveBar({ s }: { s: SettingsScreen }) {
  if (!s.dirty && !s.hasInvalid && !s.saveError && s.stage === 'edit') return null
  const n = s.changes.length
  const count = n === 1 ? '1 safety change' : `${n} safety changes`
  return (
    <div className="settings-save" role="region" aria-label="unsaved safety changes">
      <div className="settings-save-text">
        <div className="strong">
          {s.stage === 'confirm' ? `Save ${count}?` : s.stage === 'leaving' ? (n ? `Discard ${count}?` : 'Discard what you typed?') : n ? `${count} not saved yet` : 'Nothing to save yet'}
        </div>
        {n > 0 && (
          <ul className="settings-changes">
            {s.changes.map((c) => (
              <li key={c.id}>
                <span className="set-change-label">{c.label}</span>: <span className="muted">{c.from}</span> → <span className="strong">{c.to}</span>
              </li>
            ))}
          </ul>
        )}
        {s.hasInvalid && <div className="warn-text small">Fix the fields marked above before saving.</div>}
        <ErrorText>{s.saveError}</ErrorText>
      </div>
      <div className="settings-save-actions">
        {s.stage === 'confirm' ? (
          <>
            <button className="btn primary" onClick={() => void s.confirmSave()} disabled={s.saving}>
              {s.saving ? 'Saving…' : 'Confirm'}
            </button>
            <button className="btn" onClick={s.back} disabled={s.saving}>
              Back
            </button>
          </>
        ) : s.stage === 'leaving' ? (
          <>
            <button className="btn danger" onClick={s.discardAndClose}>
              Discard and close
            </button>
            <button className="btn" onClick={s.back}>
              Keep editing
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={s.requestSave} disabled={!s.dirty || s.hasInvalid}>
              Save safety settings…
            </button>
            <button className="btn" onClick={s.discard}>
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
