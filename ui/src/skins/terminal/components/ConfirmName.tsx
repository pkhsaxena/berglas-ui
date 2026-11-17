/**
 * "type … to confirm": the secret's name for deletes and saving to a file,
 * or `word` ("confirm") for saving a protected secret. The parent keeps the
 * typed value and enables its action only when it matches.
 */
export function ConfirmName({ name, word, value, onChange, why }: { name: string; word?: string; value: string; onChange: (v: string) => void; why: string }) {
  const want = word ?? name
  const ok = word ? value.trim().toLowerCase() === word : value === name
  return (
    <div style={{ margin: '6px 0' }}>
      <div className="t-keyword">{why}</div>
      <label className="row" style={{ margin: '4px 0' }}>
        <span className="muted">type <span className="t-string">{want}</span> to confirm{word && <> saving <span className="t-string">{name}</span></>}:</span>
        <input
          aria-label={`type ${want} to confirm`}
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
