import { computed, ref } from 'vue'
import { ACCESS_GATE } from '../config.js'
import type { WalrusNetwork } from '../config.js'
import {
  fetchAccessNfts,
  buildPurchaseTx,
  buildConsumeTx,
  fetchRelayChallenge,
  personalMessageForNonce,
  buildAccessProofToken,
} from '../lib/accessGate.js'
import type { AccessGateConfig, OwnedObjectsClient } from '../lib/accessGate.js'
import type { Executor } from '../lib/deploy.js'
import type { Transaction } from '@mysten/sui/transactions'

/** A wallet personal-message signer, as exposed by `useWallet().signPersonalMessage`. */
export type PersonalMessageSigner = (message: Uint8Array) => Promise<{ signature: string }>

/**
 * Reactive NFT-gate state for the operator relay.
 *
 * When no gate is configured for the network (`ACCESS_GATE[network] == null`), the relay is
 * treated as OPEN (`hasAccess === true`) and this composable is inert — behaviour is
 * unchanged from before gating existed. When a gate IS configured, `checkOwnership` decides
 * access with a single `getOwnedObjects` call (the same cheap pattern as the relay health
 * check), and `purchase`/`buildRelayAccessToken` drive the buy + prove flows.
 */
export function useAccessGate(
  network: WalrusNetwork,
  deps: {
    getClient: (network: WalrusNetwork) => OwnedObjectsClient
    /** Override the configured gate (mainly for testing); defaults to `ACCESS_GATE[network]`. */
    gate?: AccessGateConfig | null
  },
) {
  const gate: AccessGateConfig | null = deps.gate !== undefined ? deps.gate : ACCESS_GATE[network]
  const gateConfigured = gate !== null

  // No gate → open. Gate → unknown until checked.
  const hasAccess = ref<boolean | null>(gateConfigured ? null : true)
  const usesRemaining = ref<number | null>(null)
  /** Object id of the held access NFT (for the single-use consume step); null if none. */
  const nftId = ref<string | null>(null)
  const checking = ref(false)
  const error = ref<string | null>(null)

  /** Query whether `address` holds the gate NFT. Cheap; safe to call on connect. */
  async function checkOwnership(address: string): Promise<void> {
    if (!gate) {
      hasAccess.value = true
      return
    }
    checking.value = true
    error.value = null
    try {
      const nfts = await fetchAccessNfts(deps.getClient(network), address, gate.nftType, gate.gateId)
      hasAccess.value = nfts.length > 0
      usesRemaining.value = nfts.length ? nfts[0].usesRemaining : null
      nftId.value = nfts.length ? nfts[0].objectId : null
    } catch (e) {
      // A failed check must NOT hard-block the user: leave access unknown/false but keep the
      // purchase path available (the gateway re-verifies server-side regardless).
      hasAccess.value = false
      nftId.value = null
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      checking.value = false
    }
  }

  /** Purchase access via the connected wallet, then re-check ownership. */
  async function purchase(executor: Executor, address: string): Promise<void> {
    if (!gate) throw new Error('No access gate configured for this network.')
    const tx = buildPurchaseTx(gate)
    const res = await executor.signAndExecute(tx)
    if (res.digest) await executor.waitForTransaction(res.digest).catch(() => {})
    await checkOwnership(address)
  }

  /** Build the consume PTB for a single-use NFT (woven into the upload flow before proving). */
  function buildConsume(nftId: string, nonce: string): Transaction {
    if (!gate) throw new Error('No access gate configured for this network.')
    return buildConsumeTx(gate, nftId, nonce)
  }

  /**
   * Fetch a challenge from the gateway (served at the operator relay host), sign it, and
   * return the base64 access-proof token to pass to the Walrus client as the relay auth
   * token. For single-use gates supply the on-chain consume `consumeDigest`.
   */
  async function buildRelayAccessToken(opts: {
    relayHost: string
    address: string
    sign: PersonalMessageSigner
    consumeDigest?: string
  }): Promise<string> {
    const challenge = await fetchRelayChallenge(opts.relayHost)
    const { signature } = await opts.sign(personalMessageForNonce(challenge.nonce))
    return buildAccessProofToken({
      address: opts.address,
      nonce: challenge.nonce,
      signature,
      consumeDigest: opts.consumeDigest,
    })
  }

  return {
    gate,
    gateConfigured,
    hasAccess,
    usesRemaining,
    nftId,
    checking,
    error,
    /** Convenience: gate configured AND access confirmed. */
    accessGranted: computed(() => !gateConfigured || hasAccess.value === true),
    checkOwnership,
    purchase,
    buildConsume,
    buildRelayAccessToken,
  }
}
