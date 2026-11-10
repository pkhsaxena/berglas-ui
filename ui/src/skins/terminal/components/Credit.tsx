import { useEffect, useState } from 'react'

const NAME = 'Prakhar Saxena'
const EMAIL = 'saxenaprakhar1998@gmail.com'

// The name sits between `before` and `after` and links to a mailto.
const LINES: { before: string; after: string }[] = [
  { before: 'made by', after: '' },
  { before: '$ git blame →', after: '' },
  { before: '# handcrafted by', after: '' },
  { before: 'kept under wraps by', after: '' },
  { before: 'built with kms and coffee by', after: '' },
  { before: '$ sudo make me a secrets ui —', after: '' },
  { before: 'decrypted with care by', after: '' },
]

const EVERY_MS = 20_000

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * A credit line at the bottom of the page: a random line per load, then the
 * next one every 20s (not when the system asks for reduced motion).
 */
export function Credit() {
  const [i, setI] = useState(() => Math.floor(Math.random() * LINES.length))

  useEffect(() => {
    if (reducedMotion()) return
    const t = window.setInterval(() => setI((n) => (n + 1) % LINES.length), EVERY_MS)
    return () => window.clearInterval(t)
  }, [])

  const line = LINES[i]
  return (
    <footer className="credit-bar">
      {/* keyed by line so each change replays the fade */}
      <span key={i} className="credit-line">
        {line.before}{' '}
        <a href={`mailto:${EMAIL}`} title={EMAIL}>
          {NAME}
        </a>
        {line.after && ` ${line.after}`}
      </span>
    </footer>
  )
}
