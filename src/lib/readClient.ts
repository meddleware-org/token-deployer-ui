// Cached SuiClient per network for read-only queries (getOwnedObjects, etc.).
// Replaces getSuiClient from the deleted useSuiClient.ts composable.
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import type { Network } from './types.js'
import { RPC_URLS } from '../config.js'

const clients = new Map<Network, SuiJsonRpcClient>()

/** Return a memoised {@link SuiJsonRpcClient} for the given network. */
export function getReadClient(network: Network): SuiJsonRpcClient {
  let c = clients.get(network)
  if (!c) {
    c = new SuiJsonRpcClient({ url: RPC_URLS[network], network })
    clients.set(network, c)
  }
  return c
}
