import { type ReactNode, useEffect } from 'react'
import { type Ref, type Secret, versionOf } from '../../../core/api'
import { useVersionDiff } from '../../../core/hooks/useVersionDiff'
import { useSettings, useStamp } from '../../../core/settings'
import { ago } from '../../../core/time'
import { ErrorText, PaneHead } from './bits'
import { DiffView } from './DiffView'

type Props = {
  base: Ref
  versions: Secret[] | null
  versionsError: string
  shown: Secret | undefined
  onView: (id: string) => void
  /** view tabs, when this is the top pane (the Versions tab) */
  titleTabs?: ReactNode
  /** zoomed-out tabs (Versions · Overview · Matrix) while comparing */
  wideTabs?: ReactNode
}

/** Version history, with a/b pickers to diff any two versions. */
export function Versions({ base, versions, versionsError, shown, onView, titleTabs, wideTabs }: Props) {
  const d = useVersionDiff(base, versions)
  const { revealSeconds } = useSettings()
  const stamp = useStamp()
  const { clear } = d
  const label = base.backend === 'storage' ? 'Generation' : 'Version'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear])

  return (
    <div className="pane versions-pane">
      <PaneHead
        title={d.result ? `Diff #${versionOf(d.result.from)} → #${versionOf(d.result.to)}` : 'Versions'}
        tabs={titleTabs}
        wideTabs={wideTabs}
        actions={
          d.result ? (
            <span className="seg">
              <button onClick={d.clear} title="Back to the versions (Esc)">
                Hide diff
              </button>
            </span>
          ) : (
            versions && <span className="muted small">newest first</span>
          )
        }
      />
      <div className="body">
        {d.result ? null : versionsError ? (
          <div className="muted">Unavailable — see the error above.</div>
        ) : versions === null ? (
          <div className="muted">Loading…</div>
        ) : (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{label}</th>
                    <th>Updated</th>
                    {d.canDiff && <th title="pick two versions to compare">Compare</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v, i) => {
                    const id = versionOf(v)
                    const active = v === shown
                    return (
                      <tr key={id} className={active ? 'active' : undefined}>
                        <td className="mono">
                          {id} {i === 0 && <span className="badge good">latest</span>}
                        </td>
                        <td>
                          {stamp(v.updatedAt)} <span className="muted small">· {ago(v.updatedAt)}</span>
                        </td>
                        {d.canDiff && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="flag" aria-pressed={d.fromId === id} aria-label={`diff from ${id}`} onClick={() => d.pick('from', id)}>
                              a
                            </button>
                            <button className="flag" aria-pressed={d.toId === id} aria-label={`diff to ${id}`} onClick={() => d.pick('to', id)}>
                              b
                            </button>
                          </td>
                        )}
                        <td>
                          {active ? (
                            <span className="muted small">shown</span>
                          ) : (
                            <button className="link" onClick={() => onView(id)}>
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {d.canDiff ? (
              <div className="row">
                <button className="btn" onClick={d.run} disabled={d.busy}>
                  {d.busy ? 'Decrypting…' : 'Diff a → b'}
                </button>
                <ErrorText>{d.error && `Couldn't diff — ${d.error}`}</ErrorText>
              </div>
            ) : (
              base.backend === 'storage' && (
                <div className="muted small" style={{ marginTop: 8 }}>
                  Only the live generation exists. Older generations are kept only if object versioning is on for the bucket.
                </div>
              )
            )}
          </>
        )}
        {d.result && (
          <div>
            <div className="muted small">
              a: {stamp(d.result.from.updatedAt)} → b: {stamp(d.result.to.updatedAt)} · {revealSeconds > 0 ? `hides again after ${revealSeconds}s or Esc.` : 'Esc hides it.'}
            </div>
            <DiffView diff={d.result} />
          </div>
        )}
      </div>
    </div>
  )
}
