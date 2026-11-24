import { describe, expect, it } from 'vitest'
import { autoPair, BRACES } from './autopair'

const at = (v: string, c: number, key: string) => autoPair(v, c, c, key, BRACES)

describe('autoPair', () => {
  it('closes an opening bracket and puts the caret between', () => {
    expect(at('', 0, '{')).toEqual({ value: '{}', caret: 1 })
    expect(at('{service}-', 10, '{')).toEqual({ value: '{service}-{}', caret: 11 })
  })
  it('wraps the selection', () => {
    expect(autoPair('service-env', 0, 7, '{', BRACES)).toEqual({ value: '{service}-env', caret: 8 })
  })
  it('steps over a closing bracket that is already there', () => {
    expect(at('{service}', 8, '}')).toEqual({ value: '{service}', caret: 9 })
  })
  it('types a closing bracket normally when the next character is something else', () => {
    expect(at('{service', 8, '}')).toBeNull()
  })
  it('deletes an empty pair with one Backspace, and leaves other Backspaces alone', () => {
    expect(at('a{}b', 2, 'Backspace')).toEqual({ value: 'ab', caret: 1 })
    expect(at('{x}', 2, 'Backspace')).toBeNull()
    expect(at('{}', 0, 'Backspace')).toBeNull()
  })
  it('leaves other keys and selections alone', () => {
    expect(at('abc', 1, 'x')).toBeNull()
    expect(autoPair('{}', 0, 2, 'Backspace', BRACES)).toBeNull()
  })
})
