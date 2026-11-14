import type { ReactNode } from 'react'
import type { EnvOrder } from '../../../core/api'
import { type EnvLine, parseEnv } from '../../../core/envfile'
import { sortEnv } from '../../../core/envsort'
import { useSettings, useSettingsActions } from '../../../core/settings'

type Pair = Extract<EnvLine, { kind: 'pair' }>

type Props = {
  text: string
  order: EnvOrder
  /** columns in the table, for comment rows that span it */
  cols: number
  /** one row for a KEY=value line; `index` is its line in the file */
  renderPair: (line: Pair, index: number) => ReactNode
  /** when set, only matching pairs show, and comments and sections without a match are left out */
  match?: (line: Pair) => boolean
}

const note = (raw: string, cols: number, key: string, cls = 'muted') => (
  <tr key={key}>
    <td colSpan={cols} className={cls}>
      {raw}
    </td>
  </tr>
)

/** The rows of a .env table, sorted by section and key or in file order. */
export function EnvRows({ text, order, cols, renderPair, match }: Props) {
  if (order === 'file') {
    return (
      <tbody>
        {parseEnv(text).map((l, i) =>
          l.kind === 'pair' ? (!match || match(l) ? renderPair(l, i) : null) : match || l.raw.trim() === '' ? null : note(l.raw, cols, `n${i}`),
        )}
      </tbody>
    )
  }
  const s = sortEnv(text)
  if (match) {
    // filtering: matching pairs under their section heading, nothing else
    const named = s.sections.some((x) => x.title !== '')
    return (
      <tbody>
        {s.sections.map((sec, si) => {
          const hits = sec.items.filter((it) => match(it.line))
          if (hits.length === 0) return null
          return [
            named && note(sec.title === '' ? '# no section' : sec.header[0].raw, cols, `fh${si}`, sec.title === '' ? 'muted section-head' : 't-function section-head'),
            ...hits.map((it) => renderPair(it.line, it.index)),
          ]
        })}
      </tbody>
    )
  }
  const named = s.sections.some((x) => x.title !== '')
  return (
    <tbody>
      {s.fileComments.map((c) => note(c.raw, cols, `f${c.index}`))}
      {s.sections.map((sec) => [
        sec.title === ''
          ? named && note('# no section', cols, `h-none`, 'muted section-head')
          : sec.header.map((h, i) => note(h.raw, cols, `h${h.index}`, i === 0 ? 't-function section-head' : 't-function')),
        ...sec.items.flatMap((it) => [...it.notes.map((n) => note(n.raw, cols, `n${n.index}`)), renderPair(it.line, it.index)]),
        ...sec.trailing.map((n) => note(n.raw, cols, `t${n.index}`)),
      ])}
    </tbody>
  )
}

/** "sorted · file order", saved to the config so every .env view follows it. */
export function OrderToggle() {
  const { envOrder } = useSettings()
  const { setEnvOrder } = useSettingsActions()
  return (
    <div className="tabs" role="tablist" aria-label="key order">
      <button role="tab" aria-selected={envOrder === 'sorted'} onClick={() => setEnvOrder('sorted')} title="sections by header, keys A→Z inside">
        sorted
      </button>
      <button role="tab" aria-selected={envOrder === 'file'} onClick={() => setEnvOrder('file')} title="the order stored in the file">
        file order
      </button>
    </div>
  )
}
