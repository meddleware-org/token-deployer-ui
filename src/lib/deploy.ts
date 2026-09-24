// Deployment orchestration: patch -> publish -> wait -> (finalize) -> result.
// Decoupled from the wallet via an `Executor` so it is unit-testable.

import type { Transaction } from '@mysten/sui/transactions'
import { patchTemplateModule } from './template.js'
import {
  buildPublishTransaction,
  buildFinalizeTransaction,
  extractPublishResult,
} from './buildPublishTx.js'
import { deriveStructName } from './validation.js'
import type { Network, PublishResult, TokenConfig } from './types.js'

export interface SuiTxResult {
  digest: string
  objectChanges?: {
    type: string
    objectType?: string
    objectId?: string
    packageId?: string
    /** Present for created/mutated objects in the full Sui RPC response. */
    version?: string
    digest?: string
  }[]
  effects?: { status?: { status?: string; error?: string } }
}

export interface Executor {
  /** Sign with the wallet and execute; must request object changes + effects. */
  signAndExecute(tx: Transaction): Promise<SuiTxResult>
  /** Block until the digest is indexed (so new objects resolve). */
  waitForTransaction(digest: string): Promise<void>
}

export type DeployStep =
  | 'patching'
  | 'publishing'
  | 'confirming'
  | 'finalizing'
  | 'confirming-finalize'
  | 'done'

export interface DeployArgs {
  config: TokenConfig
  network: Network
  sender: string
  feeMist: bigint
  feeTreasury: string
  gasBudget: bigint
  executor: Executor
  onStep?: (step: DeployStep) => void
}

function assertSuccess(res: SuiTxResult, what: string): void {
  const status = res.effects?.status?.status
  if (status && status !== 'success') {
    throw new Error(`${what} failed: ${res.effects?.status?.error ?? status}`)
  }
}

/**
 * Deploy a token end-to-end. Returns the publish result once any required
 * finalize transaction has also confirmed.
 */
export async function deployToken(args: DeployArgs): Promise<PublishResult> {
  const { config, executor, onStep } = args
  const structName = deriveStructName(config.moduleName)
  const normalizedConfig: TokenConfig = { ...config, structName }
  const recipient = normalizedConfig.recipient || args.sender
  const isE2e = import.meta.env.VITE_E2E === '1'

  onStep?.('patching')
  const moduleBytes = await patchTemplateModule({
    moduleName: normalizedConfig.moduleName,
    structName,
    symbol: normalizedConfig.symbol,
    name: normalizedConfig.name,
    description: normalizedConfig.description,
    iconUrl: normalizedConfig.iconUrl,
    decimals: normalizedConfig.decimals,
  })

  onStep?.('publishing')
  const publishTx = buildPublishTransaction({
    moduleBytes,
    sender: args.sender,
    feeMist: args.feeMist,
    feeRecipient: args.feeTreasury,
    gasBudget: args.gasBudget,
    packagePolicy: normalizedConfig.packagePolicy,
  })
  const pub = await (async () => {
    try {
      const result = await executor.signAndExecute(publishTx)
      if (isE2e) console.log('[E2E Deploy]', 'Publish TX result:', result)
      assertSuccess(result, 'Publish')

      onStep?.('confirming')
      try {
        if (isE2e) console.log('[E2E Deploy]', 'Waiting for transaction digest:', result.digest)
        await executor.waitForTransaction(result.digest)
        if (isE2e) console.log('[E2E Deploy]', 'Transaction confirmed')
      } catch (e) {
        if (isE2e) console.error('[E2E Deploy]', 'waitForTransaction error:', e)
        throw e
      }

      return result
    } catch (e) {
      if (isE2e) console.error('[E2E Deploy]', 'Publish TX error:', e)
      throw e
    }
  })()

  const result = extractPublishResult(pub.objectChanges ?? [], {
    network: args.network,
    digest: pub.digest,
    feeRecipient: args.feeTreasury,
    feeMist: args.feeMist,
  })

  // A successful publish must surface the package id + coin type in its object
  // changes; if not, fail loudly rather than returning an empty result panel.
  if (!result.packageId || !result.coinType) {
    throw new Error(
      'Publish succeeded but the package id / coin type could not be read from the transaction effects.',
    )
  }

  // Build the currency receiving ref for finalize_registration (requires version + digest
  // from the publish objectChanges, present in production Sui RPC responses).
  const currencyChange = (pub.objectChanges ?? []).find(
    (c) => c.type === 'created' && (c.objectType ?? '').includes('coin_registry::Currency'),
  )
  const currencyRef =
    currencyChange?.objectId && currencyChange?.version && currencyChange?.digest
      ? {
          objectId: currencyChange.objectId,
          version: currencyChange.version,
          digest: currencyChange.digest,
        }
      : undefined

  // Always finalize: the finalize PTB calls coin_registry::finalize_registration,
  // which is required to promote the pending Currency<T> to a shared, wallet-discoverable
  // object. Without it, suix_getCoinMetadata returns null and wallets fall back to
  // 0 decimals, displaying raw base-unit counts instead of whole-token amounts.
  if (!result.treasuryCapId || !result.metadataCapId) {
    throw new Error('Published, but could not locate the TreasuryCap/MetadataCap to finalize.')
  }
  onStep?.('finalizing')
  const finalizeTx = buildFinalizeTransaction({
    config: { ...normalizedConfig, recipient },
    coinType: result.coinType,
    treasuryCapId: result.treasuryCapId,
    metadataCapId: result.metadataCapId,
    currencyRef,
    sender: args.sender,
    gasBudget: args.gasBudget,
  })
  const fin = await executor.signAndExecute(finalizeTx)
  assertSuccess(fin, 'Finalize')
  onStep?.('confirming-finalize')
  await executor.waitForTransaction(fin.digest)

  onStep?.('done')
  return result
}
