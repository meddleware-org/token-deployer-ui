// Cached gRPC client per network, shared by read-only queries (listOwnedObjects, etc.) and
// the deploy executor. Public fullnodes have deprecated JSON-RPC, so this is a SuiGrpcClient.
import { SuiGrpcClient } from '@mysten/sui/grpc'
import type { Network } from './types.js'
import { RPC_URLS } from '../config.js'

const clients = new Map<Network, SuiGrpcClient>()

/** Return a memoised {@link SuiGrpcClient} for the given network. */
export function getReadClient(network: Network): SuiGrpcClient {
  let c = clients.get(network)
  if (!c) {
    c = new SuiGrpcClient({ network, baseUrl: RPC_URLS[network] })
    clients.set(network, c)
  }
  return c
}

/**
 * Replace the client for `network` (E2E builds only — lets `main.ts` inject a stub client in
 * place of the network, since gRPC-web responses are binary and cannot be faked via `fetch`).
 */
export function setReadClient(network: Network, client: SuiGrpcClient): void {
  clients.set(network, client)
}
