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
import type { ClientWithCoreApi } from '@mysten/sui/client'
import { WALRUS_RELAY_HOSTS, WALRUS_MAX_TIP_MIST, WALRUS_RPC_URLS } from '../config.js'
import { isSecureOrLocal } from './accessGate.js'

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
   * Access-proof token for an NFT-gated operator relay (base64 JSON from the access gate), or a
   * provider called per request. Sent as `Authorization: Bearer` on requests to the relay origin
   * ONLY; the `nft-gate` gateway verifies it before proxying to the relay. Omit for the public
   * relay or an ungated operator relay.
   */
  uploadRelayAuthToken?: string | (() => string | undefined)
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
        // The SDK's upload-relay options are only { host, fetch, timeout, onError }: an
        // `Authorization` header must be injected through the `fetch` hook (a `headers` key is
        // silently dropped, so a gated relay would never see the proof).
        ...(opts.uploadRelayAuthToken
          ? { fetch: relayAuthFetch(host, opts.uploadRelayAuthToken) }
          : {}),
      },
    }),
  )
}

/**
 * A `fetch` that adds `Authorization: Bearer <token>` to requests whose origin is the relay's
 * origin, and to nothing else. The token (or provider) is resolved per request so a resumed flow
 * can present a fresh proof. Refuses to send a token over anything but https.
 *
 * @param relayHost - The configured upload relay base URL.
 * @param token - The access-proof token, or a provider returning it.
 * @param baseFetch - The underlying fetch (defaults to `globalThis.fetch`).
 */
export function relayAuthFetch(
  relayHost: string,
  token: string | (() => string | undefined),
  baseFetch: typeof fetch = (...args) => globalThis.fetch(...args),
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const relayOrigin = new URL(relayHost).origin
  return (url, init) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    const target = new URL(href)
    const value = typeof token === 'function' ? token() : token
    if (!value || target.origin !== relayOrigin) return baseFetch(url, init)
    if (!isSecureOrLocal(target)) {
      throw new Error(`Refusing to send the relay access token over a non-https URL (${href})`)
    }
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${value}`)
    return baseFetch(url, { ...init, headers })
  }
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
 * Unwrap a Move-struct field bag from a core `json` value. The gRPC/core API returns struct
 * fields flat; the old JSON-RPC shape nested them under `.fields`. Tolerate both, since the
 * SDK documents that the `json` shape may vary between API implementations.
 */
function structFields(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const nested = o.fields
  return nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : o
}

/**
 * Return all Walrus blobs owned by `owner`. Uses `getBlobType()` for dynamic
 * package resolution so no hardcoded addresses are needed.
 */
export async function fetchOwnedWalrusBlobs(
  suiClient: ClientWithCoreApi,
  walrusClient: ReturnType<typeof createWalrusClient>,
  owner: string,
): Promise<OwnedBlob[]> {
  const blobType = await walrusClient.walrus.getBlobType()
  type OwnedPage = Awaited<ReturnType<typeof suiClient.core.listOwnedObjects>>
  const objects: OwnedPage['objects'] = []
  let cursor: string | null | undefined = undefined
  // Page through every owned blob (a single page silently truncates large wallets).
  for (;;) {
    const page: OwnedPage = await suiClient.core.listOwnedObjects({
      owner,
      type: blobType,
      include: { json: true },
      ...(cursor ? { cursor } : {}),
    })
    objects.push(...page.objects)
    if (!page.hasNextPage || !page.cursor) break
    cursor = page.cursor
  }
  const blobs: OwnedBlob[] = []
  for (const obj of objects) {
    const fields = structFields(obj.json)
    if (!fields) continue
    const storage = structFields(fields.storage)
    try {
      blobs.push({
        objectId: obj.objectId,
        blobId: blobIdFromInt(BigInt(fields.blob_id as string)),
        size: Number(fields.size),
        endEpoch: Number(storage?.end_epoch ?? 0),
        certified: fields.certified_epoch !== null && fields.certified_epoch !== undefined,
      })
    } catch {
      // Deliberately skipped: a blob whose fields cannot be parsed is not listed (display only;
      // nothing downstream depends on its absence).
    }
  }
  return blobs
}
