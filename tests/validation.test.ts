import { describe, it, expect } from 'vitest'
import {
  validateForm,
  deriveStructName,
  parseSupply,
  isValid,
  validateIdentifier,
  hasAllowedIconScheme,
  MAX_IDENT_LEN,
} from '../src/lib/validation.js'

const good = {
  packageName: 'my_token',
  moduleName: 'mytoken',
  symbol: 'MTK',
  name: 'My Token',
  description: 'A friendly token',
  iconUrl: 'https://example.com/i.png',
  decimals: 9,
  initialSupply: '1000000',
  recipient: '',
}

describe('deriveStructName', () => {
  it('uppercases the module name (Sui OTW rule)', () => {
    expect(deriveStructName('mwsui')).toBe('MWSUI')
    expect(deriveStructName('sui_token_template')).toBe('SUI_TOKEN_TEMPLATE')
  })
})

describe('validateForm', () => {
  it('accepts a well-formed config', () => {
    expect(isValid(validateForm(good))).toBe(true)
  })

  it('rejects invalid identifiers', () => {
    expect(validateForm({ ...good, packageName: 'My-Token' }).packageName).toBeTruthy()
    expect(validateForm({ ...good, moduleName: '1coin' }).moduleName).toBeTruthy()
  })

  it('rejects unsafe characters that would break the Move byte-string', () => {
    expect(validateForm({ ...good, symbol: 'A"B' }).symbol).toBeTruthy()
    expect(validateForm({ ...good, name: 'back\\slash' }).name).toBeTruthy()
  })

  it('requires symbol and name', () => {
    expect(validateForm({ ...good, symbol: '' }).symbol).toBeTruthy()
    expect(validateForm({ ...good, name: '   ' }).name).toBeTruthy()
  })

  it('bounds decimals to 0..18', () => {
    expect(validateForm({ ...good, decimals: 19 }).decimals).toBeTruthy()
    expect(validateForm({ ...good, decimals: -1 }).decimals).toBeTruthy()
    expect(validateForm({ ...good, decimals: 6 }).decimals).toBeUndefined()
  })

  it('rejects supply that overflows u64 for the decimals', () => {
    expect(validateForm({ ...good, initialSupply: '99999999999999', decimals: 18 }).initialSupply).toBeTruthy()
    expect(validateForm({ ...good, initialSupply: 'abc' }).initialSupply).toBeTruthy()
    expect(validateForm({ ...good, initialSupply: '' }).initialSupply).toBeUndefined()
  })

  it('validates an optional recipient address', () => {
    expect(validateForm({ ...good, recipient: '0x123' }).recipient).toBeTruthy()
    expect(validateForm({ ...good, recipient: '0x' + 'a'.repeat(64) }).recipient).toBeUndefined()
  })

  it('rejects Move reserved words as package/module names', () => {
    expect(validateForm({ ...good, packageName: 'module' }).packageName).toBeTruthy()
    expect(validateForm({ ...good, moduleName: 'struct' }).moduleName).toBeTruthy()
    expect(validateForm({ ...good, moduleName: 'public' }).moduleName).toBeTruthy()
  })

  it('rejects over-length identifiers', () => {
    const tooLong = 'a'.repeat(MAX_IDENT_LEN + 1)
    expect(validateForm({ ...good, packageName: tooLong }).packageName).toBeTruthy()
    expect(validateForm({ ...good, moduleName: 'a'.repeat(MAX_IDENT_LEN) }).moduleName).toBeUndefined()
  })

  it('rejects a whitespace-only symbol even though it contains "safe" chars', () => {
    expect(validateForm({ ...good, symbol: '   ' }).symbol).toBeTruthy()
  })
})

describe('iconUrl scheme allowlist', () => {
  it('accepts https:// and ipfs:// (and empty = no icon)', () => {
    expect(isValid(validateForm({ ...good, iconUrl: 'https://x.io/a.png' }))).toBe(true)
    expect(isValid(validateForm({ ...good, iconUrl: 'ipfs://bafy.../a.png' }))).toBe(true)
    expect(isValid(validateForm({ ...good, iconUrl: '' }))).toBe(true)
    expect(hasAllowedIconScheme('HTTPS://X.IO/a.png')).toBe(true) // case-insensitive
  })

  it('rejects javascript:, data:, and insecure http:', () => {
    expect(validateForm({ ...good, iconUrl: 'javascript:alert(1)' }).iconUrl).toBeTruthy()
    expect(validateForm({ ...good, iconUrl: 'data:image/png;base64,AAAA' }).iconUrl).toBeTruthy()
    expect(validateForm({ ...good, iconUrl: 'http://x.io/a.png' }).iconUrl).toBeTruthy()
    expect(hasAllowedIconScheme('javascript:alert(1)')).toBe(false)
  })
})

describe('validateIdentifier', () => {
  it('accepts a valid identifier and rejects shape/keyword/length violations', () => {
    expect(validateIdentifier('my_token')).toBeNull()
    expect(validateIdentifier('My-Token')).toBeTruthy()
    expect(validateIdentifier('const')).toBeTruthy()
    expect(validateIdentifier('a'.repeat(MAX_IDENT_LEN + 1))).toBeTruthy()
  })
})

describe('parseSupply', () => {
  it('parses whole numbers and blank', () => {
    expect(parseSupply('')).toBe(0n)
    expect(parseSupply('  42 ')).toBe(42n)
    expect(parseSupply('1.5')).toBeNull()
    expect(parseSupply('-1')).toBeNull()
  })
})
