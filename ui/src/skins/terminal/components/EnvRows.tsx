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
}

const note = (raw: string, cols: number, key: string, cls = 'muted') => (
  <tr key={key}>
    <td colSpan={cols} className={cls}>
      {raw}
    </td>
  </tr>
)

/** The rows of a .env table, sorted by section and key or in file order. */
export function EnvRows({ text, order, cols, renderPair }: Props) {
  if (order === 'file') {
    return (
      <tbody>
        {parseEnv(text).map((l, i) => (l.kind === 'pair' ? renderPair(l, i) : l.raw.trim() === '' ? null : note(l.raw, cols, `n${i}`)))}
      </tbody>
    )
  }
  const s = sortEnv(text)
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
