// Discover coins the connected wallet has deployed, by listing the TreasuryCap<T> objects it
// owns (the deploy sends the TreasuryCap to the sender). Read-only; mirrors access-gate's
// AdminCap-based "My Gates" discovery.
import { getReadClient } from './readClient.js'
import type { Network } from './types.js'

/** One deployed coin the wallet controls (holds the TreasuryCap for). */
export interface DeployedToken {
  /** Full coin type, e.g. `0x<pkg>::mytoken::MYTOKEN`. */
  coinType: string
  /** The published package id (first segment of the coin type). */
  packageId: string
  /** Object id of the owned `TreasuryCap<T>`. */
  treasuryCapId: string
  /** The one-time-witness struct name (last segment) — a compact display label. */
  label: string
}

/** List the coins `owner` has deployed on `network` (via owned `TreasuryCap<T>` objects). */
export async function listMyTokens(owner: string, network: Network): Promise<DeployedToken[]> {
  const client = getReadClient(network)
  // A type filter without type params matches every TreasuryCap<T> instantiation.
  const { objects } = await client.listOwnedObjects({ owner, type: '0x2::coin::TreasuryCap' })
  const seen = new Set<string>()
  const out: DeployedToken[] = []
  for (const obj of objects) {
    // gRPC may render the framework address in long form (0x000…02).
    const m = obj.type.match(/^0x0*2::coin::TreasuryCap<(.+)>$/)
    if (!m) continue
    const coinType = m[1]
    if (seen.has(coinType)) continue
    seen.add(coinType)
    out.push({
      coinType,
      packageId: coinType.split('::')[0] ?? '',
      treasuryCapId: obj.objectId,
      label: coinType.split('::').pop() ?? coinType,
    })
  }
  return out
}
