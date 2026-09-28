// Builds a deploy Executor using the wallet-adapter's shared signing capability
// + the app's gRPC client for execution (returns the object changes required by
// extractPublishResult).
//
// The wallet-adapter's own Executor only returns { digest } which is not sufficient
// for the token deploy flow; we sign via the shared wallet connection but execute
// via our own client so we can request effects + object types.

import { fromBase64 } from '@mysten/sui/utils'
import { useWallet } from '@meddleware/wallet-adapter'
import type { Transaction } from '@mysten/sui/transactions'
import { toSuiTxResult } from './deploy.js'
import type { SuiTxResult, Executor } from './deploy.js'
import type { Network } from './types.js'
import { getReadClient } from './readClient.js'

/**
 * Build a deploy Executor bound to the currently connected wallet (via the
 * wallet-adapter singleton) and the given network's gRPC client.
 *
 * The returned executor signs via `sui:signTransaction` and executes via
 * `executeTransaction` with `effects + objectTypes`, mapped by {@link toSuiTxResult}
 * so the caller can extract the published package ID, coin type, TreasuryCap, etc.
 */
export async function buildDeployExecutor(network: Network): Promise<Executor> {
  const { currentWallet, account } = useWallet()
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')

  const suiClient = getReadClient(network)
  const chain = `sui:${network}` as const

  const signFeature = wallet.features['sui:signTransaction'] as
    | {
        signTransaction: (input: {
          transaction: Transaction
          account: typeof acct
          chain: `sui:${string}`
        }) => Promise<{ bytes: string; signature: string }>
      }
    | undefined
  if (!signFeature) throw new Error('This wallet cannot sign transactions.')

  return {
    async signAndExecute(tx: Transaction): Promise<SuiTxResult> {
      const { bytes, signature } = await signFeature.signTransaction({
        transaction: tx,
        account: acct,
        chain,
      })
      const res = await suiClient.executeTransaction({
        transaction: fromBase64(bytes),
        signatures: [signature],
        include: { effects: true, objectTypes: true },
      })
      return toSuiTxResult(res)
    },
    async waitForTransaction(digest: string): Promise<void> {
      await suiClient.waitForTransaction({ digest })
    },
  }
}
