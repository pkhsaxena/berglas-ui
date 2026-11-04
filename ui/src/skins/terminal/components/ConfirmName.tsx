/**
 * "type the name to confirm" for protected secrets and deletes. The parent
 * keeps the typed value and enables its action only when it equals `name`.
 */
export function ConfirmName({ name, value, onChange, why }: { name: string; value: string; onChange: (v: string) => void; why: string }) {
  const ok = value === name
  return (
    <div style={{ margin: '6px 0' }}>
      <div className="t-keyword">{why}</div>
      <label className="row" style={{ margin: '4px 0' }}>
        <span className="muted">type <span className="t-string">{name}</span> to confirm:</span>
        <input
          aria-label={`type ${name} to confirm`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          style={{ flex: '1 1 24ch' }}
        />
        <span className={ok ? 't-function' : 'muted'}>{ok ? '✓' : ''}</span>
      </label>
    </div>
  )
}
