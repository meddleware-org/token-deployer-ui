// Pure form validation. Kept separate from Vue so it is unit-testable and can be
// reused by the review step. Rules protect both the on-chain publish and the
// validity of the generated Move source.

import type { TokenConfig } from './types.js'

/** Max supply Sui `coin::mint` accepts (u64). */
export const MAX_U64 = 18_446_744_073_709_551_615n

/** Sui OTW rule: the witness struct is the module name, uppercased. */
export function deriveStructName(moduleName: string): string {
  return moduleName.toUpperCase()
}

/** Move identifier shape: lowercase start, then lowercase/digits/underscores. */
export const MOVE_IDENT = /^[a-z][a-z0-9_]*$/
/**
 * Printable ASCII excluding the double-quote and backslash, so values embed
 * safely inside a Move `b"..."` byte-string literal in the downloadable source.
 */
export const SAFE_TEXT = /^[\x20-\x21\x23-\x5b\x5d-\x7e]*$/
const SUI_ADDRESS = /^0x[0-9a-fA-F]{64}$/

/** Upper bound on package/module identifiers — bounds bytecode/const-pool size. */
export const MAX_IDENT_LEN = 64

/**
 * Schemes permitted for the on-chain `icon_url` metadata. `https:` covers a Walrus
 * aggregator URL and any hosted image; `ipfs:` covers decentralised pins. This is a
 * defence-in-depth **content** guard layered *on top of* downstream wallet/explorer URL
 * sanitisation (not a replacement for it): it stops `javascript:`, `data:`, and insecure
 * `http:` from ever being baked into the generated coin metadata, while renderers remain
 * responsible for their own sanitisation. Empty (no icon) is allowed by the caller.
 */
export const ICON_URL_ALLOWED_SCHEMES = ['https://', 'ipfs://'] as const

/** True if `url` begins with an allowed icon scheme (case-insensitive). */
export function hasAllowedIconScheme(url: string): boolean {
  const u = url.trim().toLowerCase()
  return ICON_URL_ALLOWED_SCHEMES.some((s) => u.startsWith(s))
}

/**
 * Move reserved words. A package or module named after one of these compiles
 * incorrectly or fails, so they are rejected up front. Lowercase-compared, which
 * also covers the derived (uppercased) OTW struct name.
 */
export const MOVE_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abort',
  'acquires',
  'as',
  'break',
  'const',
  'continue',
  'copy',
  'else',
  'entry',
  'enum',
  'false',
  'for',
  'friend',
  'fun',
  'has',
  'if',
  'in',
  'invariant',
  'let',
  'loop',
  'macro',
  'match',
  'module',
  'move',
  'mut',
  'native',
  'package',
  'phantom',
  'public',
  'return',
  'script',
  'spec',
  'struct',
  'true',
  'type',
  'use',
  'while',
  'key',
  'store',
  'drop',
])

/** Validate one Move identifier field; returns an error message or null. */
export function validateIdentifier(value: string): string | null {
  if (!value) return 'Required'
  if (value.length > MAX_IDENT_LEN) return `${MAX_IDENT_LEN} characters maximum`
  if (!/^[a-z]/.test(value)) return 'Must start with a lowercase letter'
  if (!MOVE_IDENT.test(value)) return 'Lowercase letters, digits and underscores only'
  if (MOVE_RESERVED_WORDS.has(value)) return `"${value}" is a reserved keyword`
  return null
}

export type FormErrors = Partial<Record<keyof TokenConfig, string>>

export interface ValidatableForm {
  packageName: string
  moduleName: string
  symbol: string
  name: string
  description: string
  iconUrl: string
  decimals: number | string
  initialSupply: string
  recipient: string
}

/** Validate the user-entered fields. Returns a map of field -> message. */
export function validateForm(form: ValidatableForm): FormErrors {
  const errors: FormErrors = {}

  const packageNameError = validateIdentifier(form.packageName)
  if (packageNameError) errors.packageName = packageNameError
  const moduleNameError = validateIdentifier(form.moduleName)
  if (moduleNameError) errors.moduleName = moduleNameError

  if (!form.symbol.trim()) errors.symbol = 'Required'
  else if (form.symbol.length > 32) errors.symbol = 'Maximum 32 characters'
  else if (!SAFE_TEXT.test(form.symbol)) errors.symbol = 'Double quotes and backslashes are not supported'

  if (!form.name.trim()) errors.name = 'Required'
  else if (form.name.length > 64) errors.name = 'Maximum 64 characters'
  else if (!SAFE_TEXT.test(form.name)) errors.name = 'Double quotes and backslashes are not supported'

  if (form.description.length > 256) errors.description = 'Maximum 256 characters'
  else if (!SAFE_TEXT.test(form.description)) errors.description = 'Double quotes and backslashes are not supported'

  if (form.iconUrl) {
    if (form.iconUrl.length > 512) errors.iconUrl = 'Maximum 512 characters'
    else if (!SAFE_TEXT.test(form.iconUrl)) errors.iconUrl = 'Double quotes and backslashes are not supported'
    else if (!hasAllowedIconScheme(form.iconUrl)) errors.iconUrl = 'Use an https:// or ipfs:// URL'
  }

  const decimals = Number(form.decimals)
  if (!Number.isInteger(decimals)) errors.decimals = 'Enter a whole number'
  else if (decimals < 0) errors.decimals = 'Must be 0 or greater'
  else if (decimals > 18) errors.decimals = 'Maximum is 18 (9 is typical on Sui)'

  const supply = parseSupply(form.initialSupply)
  if (supply === null) {
    errors.initialSupply = 'Enter a whole number, or leave blank for none'
  } else if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
    if (supply * 10n ** BigInt(decimals) > MAX_U64) {
      errors.initialSupply = 'Supply exceeds the maximum for this decimal precision'
    }
  }

  if (form.recipient && !SUI_ADDRESS.test(form.recipient)) {
    errors.recipient = 'Enter a full Sui address (0x followed by 64 hex digits)'
  }

  return errors
}

/** Parse the supply text into a non-negative bigint, or null if invalid. */
export function parseSupply(input: string): bigint | null {
  const s = input.trim()
  if (s === '') return 0n
  if (!/^\d+$/.test(s)) return null
  return BigInt(s)
}

export function isValid(errors: FormErrors): boolean {
  return Object.keys(errors).length === 0
}
