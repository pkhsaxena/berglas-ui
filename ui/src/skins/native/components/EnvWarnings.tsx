import { type EnvWarning, warningText } from '../../../core/envlint'

/** Duplicate keys and empty values, at review. They never block saving. */
export function EnvWarnings({ warnings }: { warnings: EnvWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="env-warnings" role="note">
      <div className="warn-text strong">Check before saving</div>
      <ul>
        {warnings.map((w) => (
          <li key={`${w.kind}-${w.key}`}>
            <span className="mono">{warningText(w)}</span>
            {!w.isNew && <span className="muted small"> · already in the current version</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
