import { type ReactNode, useState } from 'react'
import { refString, type Secret } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import { useCreate } from '../../../core/hooks/useCreate'
import type { Source } from '../../../core/sources'
import { ConfirmName, EnvBadge, ErrorText, PaneHead } from './bits'
import { EnvWarnings } from './EnvWarnings'

type Props = {
  source: Source
  onCreated: (s: Secret) => void
  onCancel: () => void
  titleTabs?: ReactNode
  /** prefill from a dropped file */
  initial?: { name: string; text: string; from: string }
}

export function CreateSecret({ source, onCreated, onCancel, titleTabs, initial }: Props) {
  const c = useCreate(source, onCreated, initial)
  const [typed, setTyped] = useState('')
  const target = c.ref.name ? refString(c.ref) : refString({ ...c.ref, name: '<name>' })
  const tone = c.ref.name ? toneOfSecret(c.ref.name, source.group) : null

  return (
    <div className="pane">
      <PaneHead tabs={titleTabs} title={`New secret in ${source.label || source.parent}`} actions={<EnvBadge tone={tone} />} />
      <div className="body">
        {c.phase === 'editing' ? (
          <>
            {initial && <div className="muted small">From the dropped file {initial.from}. Nothing is saved until you review and create it.</div>}
            <label className="row">
              <span className="muted" style={{ width: '9ch' }}>
                Name
              </span>
              <input aria-label="secret name" className="mono" value={c.name} onChange={(e) => c.setName(e.target.value)} spellCheck={false} autoComplete="off" autoFocus />
            </label>
            {source.backend === 'storage' && (
              <label className="row">
                <span className="muted" style={{ width: '9ch' }}>
                  KMS key
                </span>
                <input aria-label="kms key" className="mono" value={c.kmsKey} onChange={(e) => c.setKmsKey(e.target.value)} placeholder="projects/…/locations/…/keyRings/…/cryptoKeys/…" spellCheck={false} autoComplete="off" />
              </label>
            )}
            {source.backend === 'storage' && !c.kmsFromConfig && <div className="muted small">Tip: set kmsKey on this source in the config file to prefill this.</div>}
            <textarea
              aria-label="secret value"
              value={c.text}
              onChange={(e) => c.setText(e.target.value)}
              placeholder={'Value — any text, for example a .env file:\nKEY=value'}
              spellCheck={false}
              autoComplete="off"
              rows={Math.min(20, Math.max(6, c.text.split('\n').length + 1))}
              style={{ width: '100%', marginTop: 6, font: '12.5px/1.6 var(--mono)', whiteSpace: 'pre', overflowX: 'auto' }}
            />
            <div className="row">
              <button className="btn primary" onClick={c.review}>
                Review
              </button>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
              <ErrorText>{c.error}</ErrorText>
            </div>
            <div className="muted small">Nothing is created until you review and press Create.</div>
          </>
        ) : (
          <>
            <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Review</h3>
            <EnvWarnings warnings={c.warnings} />
            <div className="kv">
              <span>Name</span>
              <span className="mono">{c.ref.name}</span>
            </div>
            {source.backend === 'storage' && (
              <div className="kv">
                <span>KMS key</span>
                <span className="mono small">{c.kmsKey.trim()}</span>
              </div>
            )}
            <div className="kv">
              <span>Size</span>
              <span>
                {new TextEncoder().encode(c.text).length} bytes{c.env ? ` · ${c.env.filter((l) => l.kind === 'pair').length} keys` : ''}
              </span>
            </div>
            <pre className="value">{c.text}</pre>
            {c.isProtected && <ConfirmName name={c.ref.name} value={typed} onChange={setTyped} why="This name is protected by config." />}
            <div className="row">
              <button className={tone === 'prod' ? 'btn prod' : 'btn primary'} onClick={() => c.save(c.isProtected ? typed : undefined)} disabled={c.phase === 'saving' || (c.isProtected && typed !== c.ref.name)}>
                {c.phase === 'saving' ? 'Creating…' : `Create ${target}`}
              </button>
              <button className="btn" onClick={c.backToEdit} disabled={c.phase === 'saving'}>
                Back to edit
              </button>
              <button className="btn" onClick={onCancel} disabled={c.phase === 'saving'}>
                Cancel
              </button>
              <ErrorText>{c.error}</ErrorText>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
