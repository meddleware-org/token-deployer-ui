import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from '../src/lib/errors.js'

describe('extractErrorMessage', () => {
  it('returns the message from a standard Error', () => {
    expect(extractErrorMessage(new Error('something went wrong'))).toBe('something went wrong')
  })

  it('returns a plain string unchanged', () => {
    expect(extractErrorMessage('oops')).toBe('oops')
  })

  it('extracts message from a plain object — wallet rejection pattern', () => {
    expect(extractErrorMessage({ code: 4001, message: 'User rejected the request.' }))
      .toBe('User rejected the request.')
  })

  it('falls back to cause when Error.message is empty', () => {
    const e = new Error()
    ;(e as any).cause = new Error('nested cause')
    expect(extractErrorMessage(e)).toBe('nested cause')
  })

  it('extracts cause.message from a plain object with nested cause', () => {
    expect(extractErrorMessage({ cause: { message: 'inner error' } })).toBe('inner error')
  })

  it('falls back to String() for unrecognised values', () => {
    expect(extractErrorMessage(42)).toBe('42')
    expect(extractErrorMessage(null)).toBe('null')
  })
})
