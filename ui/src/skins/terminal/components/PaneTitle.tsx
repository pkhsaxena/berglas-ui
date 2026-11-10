import type { ReactNode } from 'react'

/**
 * A pane's title, set into its top border. The top pane of the right column
 * gets the view tabs there instead (secret · versions · overview · matrix);
 * zoomed out there are no tabs, so the css shows the plain title.
 */
export function PaneTitle({ tabs, children }: { tabs?: ReactNode; children: ReactNode }) {
  if (!tabs) return <h2>{children}</h2>
  return (
    <h2 className="has-tabs">
      <span className="title-tabs">{tabs}</span>
      <span className="title-plain">{children}</span>
    </h2>
  )
}
