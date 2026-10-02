// The app's Sui read client per network: the wallet-adapter's shared, memoised gRPC client for the
// configured RPC URL (public fullnodes have dropped JSON-RPC). E2E builds replace it with a stub via
// `setReadClient`, because gRPC-web responses are binary and cannot be faked at the fetch layer.
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { getSuiClient } from '@meddleware/wallet-adapter'
import type { TokenNetwork } from '@meddleware/sui-token-client'
import { RPC_URLS } from './config.js'

const overrides = new Map<TokenNetwork, SuiGrpcClient>()

/** The read client for `network` (an E2E stub when one is set). */
export function getReadClient(network: TokenNetwork): SuiGrpcClient {
  return overrides.get(network) ?? getSuiClient(network, RPC_URLS[network])
}

/** Replace the client for `network` (E2E builds only). */
export function setReadClient(network: TokenNetwork, client: SuiGrpcClient): void {
  overrides.set(network, client)
}
