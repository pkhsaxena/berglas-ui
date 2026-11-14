import { useEffect, useState } from 'react'

const NAME = 'Prakhar Saxena'
const EMAIL = 'saxenaprakhar1998@gmail.com'

const LINES = ['Made by', 'Built by', 'Kept under wraps by', 'Built with KMS and coffee by', 'Decrypted with care by', 'Handcrafted by', 'Encrypted, then shipped by']

const EVERY_MS = 20_000

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * A quiet credit line at the bottom: a random line per load, then the next
 * one every 20 s, sliding up into place (no fade). With reduced motion it
 * keeps the first line.
 */
export function Credit() {
  const [i, setI] = useState(() => Math.floor(Math.random() * LINES.length))
  useEffect(() => {
    if (reducedMotion()) return
    const t = window.setInterval(() => setI((n) => (n + 1) % LINES.length), EVERY_MS)
    return () => window.clearInterval(t)
  }, [])
  return (
    <footer className="credit-bar">
      {/* keyed by the line, so each new line plays the slide-in */}
      <span key={i} className="credit-line">
        {LINES[i]}{' '}
        <a href={`mailto:${EMAIL}`} title={EMAIL}>
          {NAME}
        </a>
      </span>
    </footer>
  )
}
