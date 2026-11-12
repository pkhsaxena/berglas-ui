import { Fragment } from 'react'

/**
 * A .env key that may wrap after "_", "." or "-" when it is long, so a long
 * key does not push its value into a sliver. Pair with td.env-key in the css,
 * which caps the key column's width.
 */
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
