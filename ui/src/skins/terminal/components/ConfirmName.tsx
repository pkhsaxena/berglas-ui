/**
 * "type … to confirm": `word` ("confirm") for saving a protected secret,
 * saving one to a file and every delete (`action` says which), else the
 * secret's name. The parent keeps the
 * typed value and enables its action only when it matches.
 */
export function ConfirmName({ name, word, action = 'saving', value, onChange, why }: { name: string; word?: string; action?: string; value: string; onChange: (v: string) => void; why: string }) {
  const want = word ?? name
  const ok = word ? value.trim().toLowerCase() === word : value === name
  return (
    <div style={{ margin: '6px 0' }}>
      <div className="t-keyword">{why}</div>
      <label className="row" style={{ margin: '4px 0' }}>
        <span className="muted">type <span className="t-string">{want}</span> to confirm{word && <> {action} <span className="t-string">{name}</span></>}:</span>
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
