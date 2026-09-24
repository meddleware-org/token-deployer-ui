// Minimal Walrus client for icon uploads. Mirrors the canonical helpers in the
// `@meddleware/sui-walrus` package (createWalrusClient / createBlobUploadFlow /
// walrusBlobUrl / fetchOwnedWalrusBlobs) but is kept self-contained here so it
// resolves cleanly in the app's Vite build and preserves the lazy-load boundary
// around `@mysten/walrus`. Once `@meddleware/sui-walrus` is published this file
// should be replaced by imports from it (injecting the app's relay host + max tip).
//
// Icons are stored as RAW blobs (not quilts) so `GET /v1/blobs/<blobId>` returns
// the exact image bytes — directly renderable by wallets/explorers. An upload
// relay is REQUIRED (direct-to-storage-node writes fail from browsers). Verified
// end-to-end on testnet (scripts/walrus-upload verification).

import { SuiGrpcClient } from '@mysten/sui/grpc'
import { walrus, blobIdFromInt } from '@mysten/walrus'
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { WALRUS_RELAY_HOSTS, WALRUS_MAX_TIP_MIST, WALRUS_RPC_URLS } from '../config.js'

export { ICON_EPOCHS } from './walrus-constants.js'

export type WalrusNetwork = 'testnet' | 'mainnet'

const AGGREGATOR_HOSTS: Record<WalrusNetwork, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus-mainnet.walrus.space',
}

/** Public URL that serves the raw blob bytes. */
export function walrusBlobUrl(network: WalrusNetwork, blobId: string): string {
  return `${AGGREGATOR_HOSTS[network]}/v1/blobs/${blobId}`
}

/** Options for {@link createWalrusClient}. */
export interface CreateWalrusClientOptions {
  /** Browser WASM URL (Vite `?url` import). */
  wasmUrl?: string
  /**
   * Upload relay host. Defaults to the configured operator/public relay for the
   * network ({@link WALRUS_RELAY_HOSTS}); pass a value to honour a user-supplied URL.
   */
  uploadRelayHost?: string
  /**
   * Maximum tip (MIST) the client will pay. Defaults to {@link WALRUS_MAX_TIP_MIST}.
   * The SDK throws if the relay's tip exceeds this, so keep it above the relay tip.
   */
  uploadRelayMaxTipMist?: bigint
  /**
   * Access-proof token for an NFT-gated operator relay (base64 JSON from the access gate).
   * Sent as the relay `Authorization: Bearer` header; the `nft-gate` gateway verifies it
   * before proxying to the relay. Omit for the public relay or an ungated operator relay.
   */
  uploadRelayAuthToken?: string
  /**
   * gRPC fullnode URL for the underlying `SuiGrpcClient`. Defaults to
   * {@link WALRUS_RPC_URLS} for the network (operator-overridable via `VITE_WALRUS_RPC_*`).
   * NOTE: must be a **gRPC** endpoint — not a JSON-RPC URL (see `WALRUS_RPC_URLS`).
   */
  rpcUrl?: string
}

/**
 * A Walrus-extended gRPC client configured with an upload relay + tip guard.
 *
 * The relay's tip address/amount is fetched by the SDK from the relay's
 * `/v1/tip-config`; only the `max` (client-side ceiling) is set here. The
 * default relay is the operator relay when `VITE_WALRUS_RELAY_*` is set,
 * otherwise the public Mysten relay (which earns the operator nothing).
 */
export function createWalrusClient(
  network: WalrusNetwork,
  wasmUrlOrOptions?: string | CreateWalrusClientOptions,
) {
  // Back-compat: a bare string is treated as the WASM URL.
  const opts: CreateWalrusClientOptions =
    typeof wasmUrlOrOptions === 'string' ? { wasmUrl: wasmUrlOrOptions } : (wasmUrlOrOptions ?? {})
  const host = opts.uploadRelayHost ?? WALRUS_RELAY_HOSTS[network]
  const maxTip = opts.uploadRelayMaxTipMist ?? WALRUS_MAX_TIP_MIST
  const baseUrl = opts.rpcUrl ?? WALRUS_RPC_URLS[network]
  return new SuiGrpcClient({ network, baseUrl }).$extend(
    walrus({
      ...(opts.wasmUrl ? { wasmUrl: opts.wasmUrl } : {}),
      uploadRelay: {
        host,
        sendTip: { max: Number(maxTip) },
        ...(opts.uploadRelayAuthToken
          ? { headers: { Authorization: `Bearer ${opts.uploadRelayAuthToken}` } }
          : {}),
      },
    }),
  )
}

/** Raw-blob write flow: encode -> register(tx) -> upload -> certify(tx) -> getBlob. */
export function createBlobUploadFlow(
  client: ReturnType<typeof createWalrusClient>,
  bytes: Uint8Array,
) {
  return client.walrus.writeBlobFlow({ blob: bytes })
}

/** A Walrus blob object owned by a Sui address. */
export interface OwnedBlob {
  objectId: string
  /** Aggregator-URL-compatible blob ID string. */
  blobId: string
  size: number
  endEpoch: number
  certified: boolean
}

/**
 * Return all Walrus blobs owned by `owner`. Uses `getBlobType()` for dynamic
 * package resolution so no hardcoded addresses are needed.
 */
export async function fetchOwnedWalrusBlobs(
  suiClient: SuiJsonRpcClient,
  walrusClient: ReturnType<typeof createWalrusClient>,
  owner: string,
): Promise<OwnedBlob[]> {
  const blobType = await walrusClient.walrus.getBlobType()
  const { data } = await suiClient.getOwnedObjects({
    owner,
    filter: { StructType: blobType },
    options: { showContent: true },
  })
  const blobs: OwnedBlob[] = []
  for (const item of data) {
    if (!item.data) continue
    const fields = (item.data.content as { fields?: Record<string, unknown> } | undefined)?.fields
    if (!fields) continue
    const storage = fields.storage as { fields?: { end_epoch?: unknown } } | undefined
    try {
      blobs.push({
        objectId: item.data.objectId,
        blobId: blobIdFromInt(BigInt(fields.blob_id as string)),
        size: Number(fields.size),
        endEpoch: Number(storage?.fields?.end_epoch ?? 0),
        certified: fields.certified_epoch !== null && fields.certified_epoch !== undefined,
      })
    } catch {
      // Skip blobs whose fields cannot be parsed.
    }
  }
  return blobs
}
