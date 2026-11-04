import { useState } from 'react'
import { api, encodeText, type Secret } from '../api'
import { looksLikeEnv, parseEnv } from '../envfile'
import { kmsKeyFor, protectedFor, useSettings } from '../settings'
import type { Source } from '../sources'
import { errText } from './useApp'

const SM_NAME = /^[A-Za-z0-9_-]{1,255}$/

/** Returns why a name is unusable for this backend, or ''. */
export function nameProblem(backend: Source['backend'], name: string): string {
  if (!name) return 'enter a name'
  if (backend === 'sm') return SM_NAME.test(name) ? '' : 'secret manager names are 1-255 of A-Z a-z 0-9 _ -'
  if (/\s/.test(name)) return 'no spaces in names'
  if (name.startsWith('/') || name.includes('//')) return 'no leading or doubled slashes'
  if (name.length > 1024) return 'at most 1024 characters'
  return ''
}

export const KMS_KEY = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/

/**
 * Creates a secret in one source: edit → review → save. The review is the
 * confirmation step; protected names also need the name typed.
 */
export function useCreate(source: Source, onCreated: (s: Secret) => void) {
  const settings = useSettings()
  const [phase, setPhase] = useState<'editing' | 'review' | 'saving'>('editing')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [kmsKey, setKmsKey] = useState(() => kmsKeyFor(settings, source))
  const [error, setError] = useState('')

  const ref = { backend: source.backend, parent: source.parent, name: name.trim() }
  const isProtected = protectedFor(settings, ref)

  const review = () => {
    const problem =
      nameProblem(source.backend, ref.name) ||
      (text === '' ? 'the value is empty' : '') ||
      (source.backend === 'storage' && !KMS_KEY.test(kmsKey.trim())
        ? 'kms key must look like projects/…/locations/…/keyRings/…/cryptoKeys/…'
        : '')
    setError(problem)
    if (!problem) setPhase('review')
  }

  const save = async (confirm?: string) => {
    setPhase('saving')
    setError('')
    try {
      const s = await api.create(
        { ...ref, plaintext: encodeText(text), kmsKey: source.backend === 'storage' ? kmsKey.trim() : undefined },
        confirm,
      )
      onCreated(s)
    } catch (e) {
      setError(errText(e))
      setPhase('review')
    }
  }

  const env = looksLikeEnv(text) ? parseEnv(text) : null

  return {
    phase,
    name,
    setName,
    text,
    setText,
    kmsKey,
    setKmsKey,
    kmsFromConfig: !!kmsKeyFor(settings, source),
    env,
    ref,
    isProtected,
    error,
    review,
    backToEdit: () => setPhase('editing'),
    save,
  }
}
