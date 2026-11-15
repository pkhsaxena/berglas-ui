import { type ReactNode, useState } from 'react'
import { refString, type Secret } from '../../../core/api'
import { toneOfSecret } from '../../../core/envtone'
import { useCreate } from '../../../core/hooks/useCreate'
import type { Source } from '../../../core/sources'
import { ConfirmName } from './ConfirmName'
import { EnvTag } from './EnvMarks'
import { PaneTitle } from './PaneTitle'
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

  return (
    <div className="card pane">
      <PaneTitle tabs={titleTabs}>
        new secret <span className="muted">— {source.label || source.parent}</span>
        <EnvTag tone={c.ref.name ? toneOfSecret(c.ref.name, source.group) : null} />
      </PaneTitle>
      <div className="body">
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">create</span> <span className="t-string">{target}</span>
        </div>

        {c.phase === 'editing' ? (
          <>
            {initial && <div className="muted small"># from dropped file {initial.from}; nothing is saved until you review and create it</div>}
            <label className="row">
              <span className="muted" style={{ width: '9ch' }}>
                name
              </span>
              <input aria-label="secret name" value={c.name} onChange={(e) => c.setName(e.target.value)} spellCheck={false} autoComplete="off" autoFocus />
            </label>
            {source.backend === 'storage' && (
              <label className="row">
                <span className="muted" style={{ width: '9ch' }}>
                  kms key
                </span>
                <input
                  aria-label="kms key"
                  value={c.kmsKey}
                  onChange={(e) => c.setKmsKey(e.target.value)}
                  placeholder="projects/…/locations/…/keyRings/…/cryptoKeys/…"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            )}
            {source.backend === 'storage' && !c.kmsFromConfig && (
              <div className="muted small"># tip: set kmsKey on this source in the config file to prefill this.</div>
            )}
            <textarea
              aria-label="secret value"
              value={c.text}
              onChange={(e) => c.setText(e.target.value)}
              placeholder={'value — any text, e.g. a .env file:\nKEY=value'}
              spellCheck={false}
              autoComplete="off"
              rows={Math.min(20, Math.max(6, c.text.split('\n').length + 1))}
              style={{ width: '100%', marginTop: 6, font: '12.5px/1.6 var(--mono)', whiteSpace: 'pre', overflowX: 'auto' }}
            />
            <div className="row">
              <button className="primary" onClick={c.review}>
                review
              </button>
              <button onClick={onCancel}>cancel</button>
              <span role="alert" className="t-error">
                {c.error && `error: ${c.error}`}
              </span>
            </div>
            <div className="muted small"># nothing is created until you review and press create.</div>
          </>
        ) : (
          <>
            <div className="t-keyword" style={{ marginTop: 6 }}>
              review
            </div>
            <EnvWarnings warnings={c.warnings} />
            <div className="kv">
              <span className="label">name</span>
              <span className="str">{c.ref.name}</span>
            </div>
            {source.backend === 'storage' && (
              <div className="kv">
                <span className="label">kms key</span>
                <span className="str">{c.kmsKey.trim()}</span>
              </div>
            )}
            <div className="kv">
              <span className="label">size</span>
              <span>
                {new TextEncoder().encode(c.text).length} bytes{c.env ? ` · ${c.env.filter((l) => l.kind === 'pair').length} keys` : ''}
              </span>
            </div>
            <pre className="value">{c.text}</pre>
            {c.isProtected && <ConfirmName name={c.ref.name} value={typed} onChange={setTyped} why="this name is protected by config." />}
            <div className="row">
              <button
                className="primary"
                onClick={() => c.save(c.isProtected ? typed : undefined)}
                disabled={c.phase === 'saving' || (c.isProtected && typed !== c.ref.name)}
              >
                {c.phase === 'saving' ? 'creating…' : `create ${target}`}
              </button>
              <button onClick={c.backToEdit} disabled={c.phase === 'saving'}>
                back to edit
              </button>
              <button onClick={onCancel} disabled={c.phase === 'saving'}>
                cancel
              </button>
              <span role="alert" className="t-error">
                {c.error && `error: ${c.error}`}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
