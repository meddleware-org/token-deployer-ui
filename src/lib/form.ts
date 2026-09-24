// The reactive form model (all text inputs are strings) and its conversion into
// the strongly-typed TokenConfig used by the deploy + generate pipelines.

import type { MetadataPolicy, PackagePolicy, SupplyPolicy, TokenConfig } from './types.js'
import { deriveStructName, parseSupply } from './validation.js'
import { DEFAULT_LICENSE_ID } from './licenses.js'

/**
 * The reactive form state. Every field is a string (as bound to inputs); it is
 * converted to the strongly-typed {@link TokenConfig} by {@link toTokenConfig}.
 */
export interface FormModel {
  packageName: string
  moduleName: string
  symbol: string
  name: string
  description: string
  iconUrl: string
  decimals: string
  initialSupply: string
  supplyPolicy: SupplyPolicy
  metadataPolicy: MetadataPolicy
  packagePolicy: PackagePolicy
  recipient: string
  license: string
  licenseName: string
  packageDescription: string
  projectName: string
}

/** A blank form with the recommended safe defaults pre-selected. */
export function emptyForm(): FormModel {
  return {
    packageName: '',
    moduleName: '',
    symbol: '',
    name: '',
    description: '',
    iconUrl: '',
    decimals: '9',
    initialSupply: '',
    supplyPolicy: 'mintable',
    metadataPolicy: 'updatable',
    packagePolicy: 'immutable',
    recipient: '',
    license: DEFAULT_LICENSE_ID,
    licenseName: '',
    packageDescription: '',
    projectName: '',
  }
}

/** Convert the form into a TokenConfig. `recipient` empty means the connected wallet. */
export function toTokenConfig(form: FormModel): TokenConfig {
  const structName = deriveStructName(form.moduleName)
  return {
    packageName: form.packageName.trim(),
    moduleName: form.moduleName.trim(),
    structName,
    symbol: form.symbol.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    iconUrl: form.iconUrl.trim(),
    decimals: Number(form.decimals),
    initialSupply: parseSupply(form.initialSupply) ?? 0n,
    supplyPolicy: form.supplyPolicy,
    metadataPolicy: form.metadataPolicy,
    packagePolicy: form.packagePolicy,
    recipient: form.recipient.trim(),
    license: form.license,
    licenseName: form.licenseName || form.license,
    packageDescription: form.packageDescription.trim() || `Official ${form.symbol} token.`,
    projectName: form.projectName.trim() || form.name,
  }
}
