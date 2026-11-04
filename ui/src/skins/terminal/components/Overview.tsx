import { useMemo } from 'react'
import { type Secret, versionOf } from '../../../core/api'
import type { SecretListState } from '../../../core/hooks/useSecretList'
import { overview, STALE_DAYS } from '../../../core/overview'
import type { Source } from '../../../core/sources'
import { ago } from '../../../core/time'

type Props = {
  source: Source
  list: SecretListState
  onSelect: (name: string) => void
  /** extra class for the cards, e.g. to show them only on wide screens */
  className?: string
}

/** Facts about the open source, from list metadata only; nothing is decrypted. */
export function Overview({ source, list, onSelect, className = '' }: Props) {
  const o = useMemo(() => (list.secrets ? overview(list.secrets, source.group) : null), [list.secrets, source.group])
  if (!o) return null
  const scheme = source.backend === 'storage' ? 'berglas://' : 'sm://'

  const link = (s: Secret) => (
    <button className="link" onClick={() => onSelect(s.name)} title={`${s.name} #${versionOf(s)}`}>
      {s.name}
    </button>
  )

  return (
    <>
      <div className={`card ${className}`}>
        <h2>
          overview <span className="muted">— {source.label || source.parent}</span>
        </h2>
        <div className="term-ln">
          <span className="t-prompt">$</span> <span className="t-function">stat</span>{' '}
          <span className="t-string">
            {scheme}
            {source.parent}
          </span>
        </div>
        <div className="kv">
          <span className="label">secrets</span>
          <span>{o.count}</span>
        </div>
        <div className="kv">
          <span className="label">changed</span>
          <span>
            {o.changed7d} <span className="muted">in 7d ·</span> {o.changed30d} <span className="muted">in 30d</span>
          </span>
        </div>
        {o.newest && (
          <div className="kv">
            <span className="label">latest change</span>
            <span className="str">
              {link(o.newest)} <span className="muted">· {ago(o.newest.updatedAt)}</span>
            </span>
          </div>
        )}
        <div className="kv">
          <span className="label">stale</span>
          <span>
            {o.stale.length} <span className="muted">untouched for {STALE_DAYS}d+</span>
          </span>
        </div>
        {o.kmsKeys.length > 0 && (
          <div className="kv">
            <span className="label">kms keys</span>
            <span className="str">
              {o.kmsKeys.length === 1 ? o.kmsKeys[0].key.split('/').slice(-3).join('/') : `${o.kmsKeys.length} different keys`}
            </span>
          </div>
        )}

        <div className="t-keyword" style={{ marginTop: 8 }}>
          recently changed
        </div>
        <ul className="clean">
          {o.recent.map((s) => (
            <li key={s.name} className="kv">
              <span>{link(s)}</span>
              <span className="muted">{ago(s.updatedAt)}</span>
            </li>
          ))}
        </ul>

        {o.stale.length > 0 && (
          <>
            <div className="t-keyword" style={{ marginTop: 8 }}>
              untouched longest
            </div>
            <ul className="clean">
              {o.stale.slice(0, 5).map((s) => (
                <li key={s.name} className="kv">
                  <span>{link(s)}</span>
                  <span className="t-error">{ago(s.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {o.matrix && (
        <div className={`card wide ${className}`}>
          <h2>
            matrix <span className="muted">— {source.group}</span>
          </h2>
          <div className="muted small"># rows are the first placeholder, columns the second; cells show time since the last change. – means no such secret.</div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th />
                  {o.matrix.cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.matrix.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="t-keyword" style={{ whiteSpace: 'nowrap' }}>
                      {r.key}
                    </td>
                    {r.cells.map((c, i) =>
                      c ? (
                        <td key={i}>
                          <button className="link" onClick={() => onSelect(c.name)} title={c.name}>
                            {ago(c.updatedAt).replace(' ago', '')}
                          </button>
                        </td>
                      ) : (
                        <td key={i} className="muted">
                          –
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
