import { type ReactNode, useEffect } from 'react'
import { type Ref, type Secret, versionOf } from '../../../core/api'
import { useVersionDiff } from '../../../core/hooks/useVersionDiff'
import { useSettings, useStamp } from '../../../core/settings'
import { DiffView } from './DiffView'
import { PaneTitle } from './PaneTitle'

type Props = {
  base: Ref
  versions: Secret[] | null
  versionsError: string
  shown: Secret | undefined
  onView: (id: string) => void
  /** view tabs, when this is the top pane (the versions tab) */
  titleTabs?: ReactNode
  /** zoomed-out tabs (versions · overview · matrix) while comparing */
  wideTabs?: ReactNode
}

/** Version history with a/b pickers to diff any two versions. */
export function Versions({ base, versions, versionsError, shown, onView, titleTabs, wideTabs }: Props) {
  const d = useVersionDiff(base, versions)
  const { revealSeconds } = useSettings()
  const stamp = useStamp()
  const { clear } = d
  const label = base.backend === 'storage' ? 'generation' : 'version'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear])

  return (
    <div className="card pane versions-pane">
      <PaneTitle
        tabs={titleTabs}
        wideTabs={wideTabs}
        extra={
          d.result && (
            <button onClick={d.clear} title="back to the versions (esc)">
              hide diff
            </button>
          )
        }
      >
        {d.result ? (
          <>
            diff <span className="muted">— #{versionOf(d.result.from)} → #{versionOf(d.result.to)}</span>
          </>
        ) : (
          <>
            versions <span className="muted">— newest first</span>
          </>
        )}
      </PaneTitle>
      <div className="body">
        {d.result ? null : versionsError ? (
          <div className="muted"># unavailable — see the error above.</div>
        ) : versions === null ? (
          <div className="muted"># loading…</div>
        ) : (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>{label}</th>
                    <th>updated</th>
                    {d.canDiff && <th title="pick two versions to compare">diff</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const id = versionOf(v)
                    const active = v === shown
                    return (
                      <tr key={id} className={active ? 'active' : undefined}>
                        <td className="t-prompt">{active ? '▶' : ''}</td>
                        <td className="t-number">{id}</td>
                        <td className="muted">{stamp(v.updatedAt)}</td>
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
                          {!active && (
                            <button className="link" onClick={() => onView(id)}>
                              view
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
                <button onClick={d.run} disabled={d.busy}>
                  {d.busy ? 'decrypting…' : 'diff a → b'}
                </button>
                <span role="alert" className="t-error">
                  {d.error && `error: ${d.error}`}
                </span>
              </div>
            ) : (
              base.backend === 'storage' && (
                <div className="muted small"># only the live generation exists. older generations are kept only if object versioning is on for the bucket.</div>
              )
            )}
          </>
        )}

        {d.result && (
          <div>
            <div className="term-ln">
              <span className="t-prompt">$</span> <span className="t-function">diff</span>{' '}
              <span className="t-keyword">
                #{versionOf(d.result.from)} #{versionOf(d.result.to)}
              </span>
            </div>
            <div className="muted small">
              # a: {stamp(d.result.from.updatedAt)} → b: {stamp(d.result.to.updatedAt)} ·{' '}
              {revealSeconds > 0 ? `hidden again after ${revealSeconds}s or esc.` : 'esc hides it.'}
            </div>
            <DiffView diff={d.result} />
          </div>
        )}
      </div>
    </div>
  )
}
