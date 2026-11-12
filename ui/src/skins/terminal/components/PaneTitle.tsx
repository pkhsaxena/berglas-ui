import type { ReactNode } from 'react'

type Props = {
  /** view tabs shown at normal width (the right column's top pane) */
  tabs?: ReactNode
  /** view tabs shown only when zoomed out (e.g. the versions column while comparing) */
  wideTabs?: ReactNode
  children: ReactNode
}

/**
 * A pane's title, set into its top border. Tabs can take the title's place:
 * `tabs` at normal width, `wideTabs` when zoomed out; elsewhere the css shows
 * the plain title.
 */
export function PaneTitle({ tabs, wideTabs, children }: Props) {
  if (!tabs && !wideTabs) return <h2>{children}</h2>
  const cls = [tabs && 'has-tabs', wideTabs && 'has-wide-tabs'].filter(Boolean).join(' ')
  return (
    <h2 className={cls}>
      {tabs && <span className="title-tabs">{tabs}</span>}
      {wideTabs && <span className="title-wide-tabs">{wideTabs}</span>}
      <span className="title-plain">{children}</span>
    </h2>
  )
}
