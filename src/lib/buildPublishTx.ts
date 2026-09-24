// PTB builders for deploying a coin.
//
// Two transactions, because the OTW `init()` creates the TreasuryCap/MetadataCap
// and sends them to the sender — they are NOT results of `tx.publish`, so they
// can only be used after the publish executes:
//
//   1. buildPublishTransaction — publish the patched module, take the trivial
//      fee, and apply the UpgradeCap policy (make immutable, or keep). The
//      TreasuryCap + MetadataCap land with the sender automatically.
//   2. buildFinalizeTransaction — (optional) mint the initial supply, apply the
//      supply + metadata policies, promote the currency in the registry, and move
//      the caps/supply to the recipient. Only needed when any of those differ
//      from the defaults.

import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import type { Network, PublishResult, TokenConfig } from './types.js'

const SUI_FRAMEWORK = '0x2'
const MOVE_STDLIB = '0x1'

export interface BuildPublishArgs {
  moduleBytes: Uint8Array
  sender: string
  feeMist: bigint
  feeRecipient: string
  gasBudget: bigint
  packagePolicy: TokenConfig['packagePolicy']
}

/**
 * Publish PTB: publish -> (make_immutable | transfer UpgradeCap) + fee split.
 * The user signs this; they pay gas and the fee.
 */
export function buildPublishTransaction(args: BuildPublishArgs): Transaction {
  const tx = new Transaction()
  tx.setSender(args.sender)

  const [upgradeCap] = tx.publish({
    modules: [toBase64(args.moduleBytes)],
    dependencies: [MOVE_STDLIB, SUI_FRAMEWORK],
  })

  if (args.packagePolicy === 'immutable') {
    tx.moveCall({ target: `${SUI_FRAMEWORK}::package::make_immutable`, arguments: [upgradeCap] })
  } else {
    tx.transferObjects([upgradeCap], args.sender)
  }

  // Trivial fee: split from the gas coin into the operator treasury.
  if (args.feeMist > 0n) {
    const [fee] = tx.splitCoins(tx.gas, [args.feeMist])
    tx.transferObjects([fee], args.feeRecipient)
  }

  tx.setGasBudget(args.gasBudget)
  return tx
}

export interface BuildFinalizeArgs {
  config: TokenConfig
  coinType: string
  treasuryCapId: string
  metadataCapId: string
  /**
   * Full object reference for the pending Currency<T> object (at address 0xc).
   * When provided, `finalize_registration` is called first in the PTB, promoting the
   * pending Currency to a shared, RPC-discoverable object so wallets can read the
   * coin's decimal metadata via suix_getCoinMetadata.
   */
  currencyRef?: { objectId: string; version: string; digest: string }
  sender: string
  gasBudget: bigint
}

/** Whether a finalize transaction is needed at all for this config. */
export function needsFinalize(config: TokenConfig, sender: string): boolean {
  return (
    config.initialSupply > 0n ||
    config.supplyPolicy === 'fixed' ||
    config.metadataPolicy === 'frozen' ||
    config.recipient.toLowerCase() !== sender.toLowerCase()
  )
}

/**
 * Finalize PTB: register the coin in the registry, mint initial supply, apply
 * supply/metadata policy, and route caps to the recipient.
 * Built after the publish effects reveal the cap object IDs.
 */
export function buildFinalizeTransaction(args: BuildFinalizeArgs): Transaction {
  const { config, coinType } = args
  const tx = new Transaction()
  tx.setSender(args.sender)
  const recipient = config.recipient || args.sender

  // Always call finalize_registration when we have the full object ref for the pending
  // Currency<T>. This promotes it from a pending owned object (at @0xc) to a shared,
  // RPC-discoverable object so wallets can read decimals via suix_getCoinMetadata.
  // Without this step wallets fall back to 0 decimals and display raw base-unit counts.
  if (args.currencyRef) {
    tx.moveCall({
      target: `${SUI_FRAMEWORK}::coin_registry::finalize_registration`,
      typeArguments: [coinType],
      arguments: [
        tx.object('0xc'),               // &mut CoinRegistry (shared object at well-known address)
        tx.receivingRef(args.currencyRef), // Receiving<Currency<T>> — pending object at @0xc
      ],
    })
  }

  // Mint the initial supply (scaled by decimals) to the recipient.
  if (config.initialSupply > 0n) {
    const amount = config.initialSupply * 10n ** BigInt(config.decimals)
    const minted = tx.moveCall({
      target: `${SUI_FRAMEWORK}::coin::mint`,
      typeArguments: [coinType],
      arguments: [tx.object(args.treasuryCapId), tx.pure.u64(amount)],
    })
    tx.transferObjects([minted], recipient)
  }

  // Supply policy: fixed => freeze the TreasuryCap (no further minting possible);
  // mintable => keep it with the recipient.
  if (config.supplyPolicy === 'fixed') {
    tx.moveCall({
      target: `${SUI_FRAMEWORK}::transfer::public_freeze_object`,
      typeArguments: [`${SUI_FRAMEWORK}::coin::TreasuryCap<${coinType}>`],
      arguments: [tx.object(args.treasuryCapId)],
    })
  } else if (recipient.toLowerCase() !== args.sender.toLowerCase()) {
    tx.transferObjects([tx.object(args.treasuryCapId)], recipient)
  }

  // Metadata policy: frozen => freeze the MetadataCap (no further metadata edits);
  // updatable => keep it with the recipient.
  if (config.metadataPolicy === 'frozen') {
    tx.moveCall({
      target: `${SUI_FRAMEWORK}::transfer::public_freeze_object`,
      typeArguments: [`${SUI_FRAMEWORK}::coin_registry::MetadataCap<${coinType}>`],
      arguments: [tx.object(args.metadataCapId)],
    })
  } else if (recipient.toLowerCase() !== args.sender.toLowerCase()) {
    tx.transferObjects([tx.object(args.metadataCapId)], recipient)
  }

  tx.setGasBudget(args.gasBudget)
  return tx
}

interface ObjectChange {
  type: string
  objectType?: string
  objectId?: string
  packageId?: string
  /** Version and digest are present for created/mutated objects in the full RPC response. */
  version?: string
  digest?: string
}

/** Pull package id, coin type and cap ids out of publish `objectChanges`. */
export function extractPublishResult(
  objectChanges: ObjectChange[],
  ctx: { network: Network; digest: string; feeRecipient: string; feeMist: bigint },
): PublishResult {
  const published = objectChanges.find((c) => c.type === 'published')
  const packageId = published?.packageId ?? ''

  const createdOfType = (needle: string) =>
    objectChanges.find((c) => c.type === 'created' && (c.objectType ?? '').includes(needle))

  const treasury = createdOfType('coin::TreasuryCap')
  const coinTypeMatch = treasury?.objectType?.match(/TreasuryCap<(.+)>/)
  const coinType = coinTypeMatch?.[1] ?? ''

  const currency = createdOfType('coin_registry::Currency')

  return {
    network: ctx.network,
    packageId,
    coinType,
    treasuryCapId: treasury?.objectId,
    metadataCapId: createdOfType('coin_registry::MetadataCap')?.objectId,
    currencyId: currency?.objectId,
    currencyVersion: currency?.version,
    currencyDigest: currency?.digest,
    upgradeCapId: createdOfType('package::UpgradeCap')?.objectId,
    digest: ctx.digest,
    feeRecipient: ctx.feeRecipient,
    feeMist: ctx.feeMist.toString(),
  }
}
