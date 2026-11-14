import type { EnvTone } from '../../../core/envtone'

/** "[prod]" after a name, in the environment's color. */
export function EnvTag({ tone, label }: { tone: EnvTone | null; label?: string | null }) {
  if (!tone) return null
  return <span className={`env-tag tone-${tone}`}>[{label || tone}]</span>
}

/**
 * The top of a production secret's pane: a red bar saying what protection
 * means here. Staging and dev get a thin rule in their color instead.
 */
export function EnvBanner({ tone, isProtected, readOnly }: { tone: EnvTone | null; isProtected: boolean; readOnly: boolean }) {
  if (tone === 'prod')
    return (
      <div className="env-banner" role="note">
        <span>!! production</span>
        <span className="why">
          {readOnly ? '— read-only by config' : isProtected ? '— protected: saving or deleting asks for the name' : '— changes here reach production'}
        </span>
      </div>
    )
  if (tone) return <div className={`env-rule tone-${tone}`} />
  return null
}
