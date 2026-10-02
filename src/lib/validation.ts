// The form layer: turns the token rules from @meddleware/sui-token-client into per-field messages for
// the UI. The rules themselves (identifiers, safe text, icon schemes, decimals, supply bounds) live
// in the client, which also enforces them with assertTokenConfig before any deploy or generation.

import {
  MAX_U64,
  SAFE_TEXT,
  TOKEN_LIMITS,
  hasAllowedIconScheme,
  isValidDecimals,
  parseSupply,
  validateIdentifier,
  type TokenConfig,
} from '@meddleware/sui-token-client'

export { deriveStructName, parseSupply } from '@meddleware/sui-token-client'

const SUI_ADDRESS = /^0x[0-9a-fA-F]{64}$/

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

function textError(value: string, max: number, required: boolean): string | undefined {
  if (required && !value.trim()) return 'Required'
  if (value.length > max) return `Maximum ${max} characters`
  if (!SAFE_TEXT.test(value)) return 'Double quotes and backslashes are not supported'
  return undefined
}

/** Validate the user-entered fields. Returns a map of field → message. */
export function validateForm(form: ValidatableForm): FormErrors {
  const errors: FormErrors = {}

  const packageNameError = validateIdentifier(form.packageName)
  if (packageNameError) errors.packageName = packageNameError
  const moduleNameError = validateIdentifier(form.moduleName)
  if (moduleNameError) errors.moduleName = moduleNameError

  const symbol = textError(form.symbol, TOKEN_LIMITS.symbol, true)
  if (symbol) errors.symbol = symbol
  const name = textError(form.name, TOKEN_LIMITS.name, true)
  if (name) errors.name = name
  const description = textError(form.description, TOKEN_LIMITS.description, false)
  if (description) errors.description = description
  if (form.iconUrl) {
    const icon = textError(form.iconUrl, TOKEN_LIMITS.iconUrl, false)
    if (icon) errors.iconUrl = icon
    else if (!hasAllowedIconScheme(form.iconUrl)) errors.iconUrl = 'Use an https:// or ipfs:// URL'
  }

  const decimals = Number(form.decimals)
  if (!Number.isInteger(decimals)) errors.decimals = 'Enter a whole number'
  else if (decimals < TOKEN_LIMITS.decimals.min) errors.decimals = `Must be ${TOKEN_LIMITS.decimals.min} or greater`
  else if (decimals > TOKEN_LIMITS.decimals.max) errors.decimals = `Maximum is ${TOKEN_LIMITS.decimals.max} (9 is typical on Sui)`

  const supply = parseSupply(form.initialSupply)
  if (supply === null) {
    errors.initialSupply = 'Enter a whole number, or leave blank for none'
  } else if (isValidDecimals(decimals) && supply * 10n ** BigInt(decimals) > MAX_U64) {
    errors.initialSupply = 'Supply exceeds the maximum for this decimal precision'
  }

  if (form.recipient && !SUI_ADDRESS.test(form.recipient)) {
    errors.recipient = 'Enter a full Sui address (0x followed by 64 hex digits)'
  }

  return errors
}

export function isValid(errors: FormErrors): boolean {
  return Object.keys(errors).length === 0
}
