// Builds the deploy Executor from the wallet-adapter's shared executor, executing through this
// app's gRPC client (`getReadClient`, which E2E builds stub) and asking for the effects and
// object types `extractPublishResult` needs. Signing, the chain check and the account binding
// are the wallet-adapter's.

import { buildExecutor } from '@meddleware/wallet-adapter'
import type { Transaction } from '@mysten/sui/transactions'
import { toSuiTxResult } from './deploy.js'
import type { SuiTxResult, Executor } from './deploy.js'
import type { Network } from './types.js'
import { getReadClient } from './readClient.js'
import { RPC_URLS } from '../config.js'

/**
 * Build a deploy Executor bound to the currently connected wallet and `network`.
 *
 * `signAndExecute` requests `effects + objectTypes` and maps the result with
 * {@link toSuiTxResult}, so the caller can extract the published package id, coin type,
 * TreasuryCap, MetadataCap and the Currency ref. A failed transaction is returned (not thrown);
 * `deploy.ts` checks its status.
 *
 * @throws {Error} if no wallet is connected, it cannot sign transactions, or its account does not
 *   list `sui:<network>`.
 */
export async function buildDeployExecutor(network: Network): Promise<Executor> {
  const executor = await buildExecutor(network, RPC_URLS[network], { client: getReadClient(network) })
  return {
    async signAndExecute(tx: Transaction): Promise<SuiTxResult> {
      const { result } = await executor.signAndExecute(tx, { include: { effects: true, objectTypes: true } })
      return toSuiTxResult(result)
    },
    async waitForTransaction(digest: string): Promise<void> {
      await executor.waitForTransaction(digest)
    },
  }
}
