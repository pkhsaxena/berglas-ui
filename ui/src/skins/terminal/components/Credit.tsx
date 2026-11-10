import { useEffect, useState } from 'react'

const NAME = 'Prakhar Saxena'
const EMAIL = 'saxenaprakhar1998@gmail.com'

// Each line is `before` followed by the linked name.
const LINES = [
  'made by',
  '$ git blame →',
  '# handcrafted by',
  'kept under wraps by',
  'built with kms and coffee by',
  '$ sudo make me a secrets ui —',
  'decrypted with care by',
]

const EVERY_MS = 20_000
const TYPE_MS = 35
const ERASE_MS = 15

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const fullLength = (i: number) => LINES[i].length + 1 + NAME.length

/**
 * A credit line at the bottom of the page, typed out like a terminal: a
 * random line per load, then every 20s the line is erased and the next one
 * typed in. With reduced motion it shows the first line as is and stays.
 */
export function Credit() {
  const [i, setI] = useState(() => Math.floor(Math.random() * LINES.length))
  // how many characters of `before + ' ' + NAME` are shown
  const [shown, setShown] = useState(() => (reducedMotion() ? fullLength(i) : 0))
  const [phase, setPhase] = useState<'typing' | 'idle' | 'erasing'>(() => (reducedMotion() ? 'idle' : 'typing'))

  useEffect(() => {
    if (phase === 'idle') {
      if (reducedMotion()) return
      const t = window.setTimeout(() => setPhase('erasing'), EVERY_MS)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(
      () => {
        if (phase === 'typing') {
          if (shown < fullLength(i)) setShown(shown + 1)
          else setPhase('idle')
        } else if (shown > 0) setShown(shown - 1)
        else {
          setI((i + 1) % LINES.length)
          setPhase('typing')
        }
      },
      phase === 'typing' ? TYPE_MS : ERASE_MS,
    )
    return () => window.clearTimeout(t)
  }, [phase, shown, i])

  const before = LINES[i]
  const name = NAME.slice(0, Math.max(0, shown - before.length - 1))
  return (
    <footer className="credit-bar">
      {before.slice(0, shown)}
      {shown > before.length && ' '}
      {name && (
        <a href={`mailto:${EMAIL}`} title={EMAIL}>
          {name}
        </a>
      )}
      {phase !== 'idle' && <span className="credit-cursor" aria-hidden="true" />}
    </footer>
  )
}
