import { type EnvWarning, warningText } from '../../../core/envlint'

/** Duplicate keys and empty values, at review. They never block saving. */
export function EnvWarnings({ warnings }: { warnings: EnvWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="env-warnings" role="note">
      {warnings.map((w) => (
        <div key={`${w.kind}-${w.key}`}>
          <span className="t-string">warning:</span> {warningText(w)}
          {!w.isNew && <span className="muted"> # already in the current version</span>}
        </div>
      ))}
    </div>
  )
}
