import { Fragment, type ReactNode } from 'react'
import type { EnvTone } from '../../../core/envtone'

/** A pane's header: `tabs` at normal width, `wideTabs` zoomed out, else the title. */
export function PaneHead({ title, tabs, wideTabs, actions }: { title: ReactNode; tabs?: ReactNode; wideTabs?: ReactNode; actions?: ReactNode }) {
  const cls = ['pane-head', tabs && 'has-tabs', wideTabs && 'has-wide-tabs'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {tabs && <span className="head-tabs">{tabs}</span>}
      {wideTabs && <span className="head-wide-tabs">{wideTabs}</span>}
      <h2 className="head-title">{title}</h2>
      {actions && (
        <>
          <span className="spacer" />
          {actions}
        </>
      )}
    </div>
  )
}

/** A .env key that may wrap after "_", "." or "-" (see td.env-key in the css). */
export function KeyText({ k }: { k: string }) {
  const parts = k.split(/(?<=[_.-])/)
  return (
    <span className="k">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </span>
  )
}

const TONE_LABEL: Record<EnvTone, string> = { prod: 'prod', staging: 'staging', dev: 'dev' }

/** A small colored badge naming an environment. */
export function EnvBadge({ tone, label }: { tone: EnvTone | null; label?: string | null }) {
  if (!tone) return null
  return <span className={`badge tone-${tone}`}>{label || TONE_LABEL[tone]}</span>
}

/** A colored square for an environment, for list rows. */
export const EnvDot = ({ tone }: { tone: EnvTone | null }) => <span className={`dot${tone ? ` tone-${tone}` : ''}`} aria-hidden="true" />

/** The lock icon, for protected and production states. */
export const LockIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

/**
 * "Type the name to confirm" for protected secrets and deletes. The parent
 * keeps the typed value and enables its action only when it equals `name`.
 */
export function ConfirmName({ name, value, onChange, why }: { name: string; value: string; onChange: (v: string) => void; why: string }) {
  const ok = value === name
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="warn-text strong">{why}</div>
      <label className="row" style={{ margin: '6px 0' }}>
        <span className="muted">
          Type <span className="mono strong">{name}</span> to confirm
        </span>
        <input aria-label={`type ${name} to confirm`} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" style={{ flex: '1 1 24ch' }} />
        <span className={ok ? 'good-text' : 'muted'}>{ok ? '✓' : ''}</span>
      </label>
    </div>
  )
}

/** An error line; renders nothing without a message, but keeps the live region. */
export const ErrorText = ({ children }: { children?: ReactNode }) => (
  <span role="alert" className="bad-text">
    {children}
  </span>
)

/**
 * The banner over a production secret: red, with what protection means here.
 * Staging and dev secrets get a thin colored strip instead.
 */
export function EnvBanner({ tone, isProtected, readOnly }: { tone: EnvTone | null; isProtected: boolean; readOnly: boolean }) {
  if (tone === 'prod')
    return (
      <div className="env-banner" role="note">
        <LockIcon />
        Production
        <span style={{ fontWeight: 400 }}>
          {readOnly ? '· read-only by config' : isProtected ? '· protected — saving or deleting asks you to type the name' : '· changes here reach production'}
        </span>
      </div>
    )
  if (tone) return <div className={`env-strip tone-${tone}`} />
  return null
}

