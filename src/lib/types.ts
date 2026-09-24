// Shared types for the token deployer.

/** A Sui network the deployer can target. */
export type Network = 'testnet' | 'mainnet' | 'localnet'

/** Whether the deployer keeps the ability to mint more supply after launch. */
export type SupplyPolicy = 'fixed' | 'mintable'

/** Whether description/icon stay updatable (MetadataCap retained) or are frozen. */
export type MetadataPolicy = 'updatable' | 'frozen'

/** Whether the package code can be upgraded, or is made immutable at publish. */
export type PackagePolicy = 'immutable' | 'upgradeable'

/**
 * The full set of choices a user makes. `identifiers` are baked into the coin
 * type and are permanent; `symbol`/`name`/`decimals` are permanent on-chain.
 */
export interface TokenConfig {
  /** Move package name, e.g. "my_token" (snake_case identifier). */
  packageName: string
  /** Move module name, e.g. "mytoken" (snake_case identifier). */
  moduleName: string
  /** One-time-witness struct name, e.g. "MYTOKEN" (SCREAMING_SNAKE identifier). */
  structName: string

  symbol: string
  name: string
  description: string
  /** Icon URL (may be a Walrus aggregator URL). Empty string allowed. */
  iconUrl: string
  /** 0..255; conventionally 9 on Sui. */
  decimals: number

  /** Whole-token initial supply minted to the recipient (before decimals scaling). Use 0 for none. */
  initialSupply: bigint
  supplyPolicy: SupplyPolicy
  metadataPolicy: MetadataPolicy
  packagePolicy: PackagePolicy

  /** Address that receives the caps + initial supply. Defaults to the connected wallet. */
  recipient: string

  /** SPDX id (e.g. "MIT", "CC0-1.0") or "NONE" for proprietary. Affects the downloadable package only. */
  license: string
  /** Human-readable license name for the README (defaults to the SPDX id). */
  licenseName?: string
  /** Free-text descriptions used only in generated docs. */
  packageDescription: string
  projectName: string
}

/** Result of a successful on-chain publish. */
export interface PublishResult {
  network: Network
  packageId: string
  coinType: string
  treasuryCapId?: string
  metadataCapId?: string
  currencyId?: string
  /** Version and digest of the pending Currency<T> object — needed for finalize_registration. */
  currencyVersion?: string
  currencyDigest?: string
  upgradeCapId?: string
  digest: string
  /** Where the trivial fee was sent, and how much (MIST). */
  feeRecipient: string
  feeMist: string
}
