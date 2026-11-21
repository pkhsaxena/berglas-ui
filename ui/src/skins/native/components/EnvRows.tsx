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
  /** when set, only matching pairs show, under their section headings */
  match?: (line: Pair) => boolean
  /** keys left out of their place and listed last, in this order, under a New keys heading (the editor's keys added during an edit) */
  tail?: string[]
}

const note = (raw: string, cols: number, key: string, head = false) => (
  <tr key={key} className={head ? 'note section-head' : 'note'}>
    <td colSpan={cols}>{raw}</td>
  </tr>
)

/** The rows of a .env table, sorted by section and key or in file order. */
export function EnvRows({ text, order, cols, renderPair, match, tail }: Props) {
  const last = new Set(tail ?? [])
  const placed = (l: Pair) => !last.has(l.key) && (!match || match(l))
  // the tail: each key's last line, in the order given
  const lines = parseEnv(text)
  const tailRows = (tail ?? []).flatMap((k) => {
    const i = lines.findLastIndex((l) => l.kind === 'pair' && l.key === k)
    const l = lines[i]
    return i >= 0 && l.kind === 'pair' && (!match || match(l)) ? [renderPair(l, i)] : []
  })
  const tailBlock = tailRows.length ? [note('New keys', cols, 'tail-head', true), ...tailRows] : []
  if (order === 'file') {
    return (
      <tbody>
        {lines.map((l, i) =>
          l.kind === 'pair' ? (placed(l) ? renderPair(l, i) : null) : match || l.raw.trim() === '' ? null : note(l.raw, cols, `n${i}`),
        )}
        {tailBlock}
      </tbody>
    )
  }
  const s = sortEnv(text)
  const named = s.sections.some((x) => x.title !== '')
  if (match) {
    return (
      <tbody>
        {s.sections.map((sec, si) => {
          const hits = sec.items.filter((it) => placed(it.line))
          if (hits.length === 0) return null
          return [named && note(sec.title === '' ? 'No section' : sec.title, cols, `fh${si}`, true), ...hits.map((it) => renderPair(it.line, it.index))]
        })}
        {tailBlock}
      </tbody>
    )
  }
  return (
    <tbody>
      {s.fileComments.map((c) => note(c.raw, cols, `f${c.index}`))}
      {s.sections.map((sec) => {
        const items = sec.items.filter((it) => !last.has(it.line.key))
        if (sec.items.length > 0 && items.length === 0) return null
        return [
        sec.title === ''
          ? named && note('No section', cols, `h-none`, true)
          : sec.header.map((h, i) => note(i === 0 ? sec.title : h.raw, cols, `h${h.index}`, i === 0)),
        ...items.flatMap((it) => [...it.notes.map((n) => note(n.raw, cols, `n${n.index}`)), renderPair(it.line, it.index)]),
        ...sec.trailing.map((n) => note(n.raw, cols, `t${n.index}`)),
        ]
      })}
      {tailBlock}
    </tbody>
  )
}

/** Sorted · File order, saved to the config so every .env view follows it. */
export function OrderToggle() {
  const { envOrder } = useSettings()
  const { setEnvOrder } = useSettingsActions()
  return (
    <div className="seg" role="tablist" aria-label="key order">
      <button role="tab" aria-selected={envOrder === 'sorted'} onClick={() => setEnvOrder('sorted')} title="sections by header, keys A→Z inside">
        Sorted
      </button>
      <button role="tab" aria-selected={envOrder === 'file'} onClick={() => setEnvOrder('file')} title="the order stored in the file">
        File order
      </button>
    </div>
  )
}
