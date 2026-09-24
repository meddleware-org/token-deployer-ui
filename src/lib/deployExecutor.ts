// Builds a deploy Executor using the wallet-adapter's shared signing capability
// + SuiClient for execution (returns objectChanges required by extractPublishResult).
//
// The wallet-adapter's own Executor only returns { digest } which is not sufficient
// for the token deploy flow; we sign via the shared wallet connection but execute
// via SuiClient so we can request showEffects + showObjectChanges.

import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { useWallet } from '@meddleware/wallet-adapter'
import type { Transaction } from '@mysten/sui/transactions'
import type { SuiTxResult, Executor } from './deploy.js'
import type { Network } from './types.js'
import { RPC_URLS } from '../config.js'

/**
 * Build a deploy Executor bound to the currently connected wallet (via the
 * wallet-adapter singleton) and the given network's RPC URL.
 *
 * The returned executor signs via `sui:signTransaction` and executes via
 * `SuiClient.executeTransactionBlock` with `showEffects + showObjectChanges`
 * so the caller can extract the published package ID, coin type, TreasuryCap, etc.
 */
export async function buildDeployExecutor(network: Network): Promise<Executor> {
  const { currentWallet, account } = useWallet()
  const wallet = currentWallet.value
  const acct = account.value
  if (!wallet || !acct) throw new Error('Connect a wallet first.')

  const suiClient = new SuiJsonRpcClient({ url: RPC_URLS[network], network })
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
      const res = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      })
      return res as unknown as SuiTxResult
    },
    async waitForTransaction(digest: string): Promise<void> {
      await suiClient.waitForTransaction({ digest })
    },
  }
}
