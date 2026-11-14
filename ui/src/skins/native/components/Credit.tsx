import { useState } from 'react'

const NAME = 'Prakhar Saxena'
const EMAIL = 'saxenaprakhar1998@gmail.com'

const LINES = ['Made by', 'Built by', 'Kept under wraps by', 'Built with KMS and coffee by', 'Decrypted with care by']

/** A quiet credit line at the bottom; a different line on each load, no animation. */
export function Credit() {
  const [i] = useState(() => Math.floor(Math.random() * LINES.length))
  return (
    <footer className="credit-bar">
      {LINES[i]}{' '}
      <a href={`mailto:${EMAIL}`} title={EMAIL}>
        {NAME}
      </a>
    </footer>
  )
}
