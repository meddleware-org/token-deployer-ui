// Deployment-wide configuration. Operator values (fee + treasury) are read from
// Vite env vars so they can be set at build/deploy time without code changes.
// See .env.example.
import type { Network } from './lib/types.js'
import type { AccessGateConfig } from './lib/accessGate.js'

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

/**
 * Public JSON-RPC fullnode URLs per network (overridable via `VITE_RPC_*`).
 *
 * NOTE: the official testnet fullnode (`fullnode.testnet.sui.io`) now serves gRPC
 * only and returns 404 for JSON-RPC, so a JSON-RPC-capable endpoint is used for
 * testnet. Operators should set `VITE_RPC_*` to their preferred (often paid) RPC
 * for production to avoid public rate limits.
 */
export const RPC_URLS: Record<Network, string> = {
  mainnet: env.VITE_RPC_MAINNET || 'https://fullnode.mainnet.sui.io:443',
  testnet: env.VITE_RPC_TESTNET || 'https://sui-testnet-rpc.publicnode.com',
  localnet: env.VITE_RPC_LOCALNET || 'http://127.0.0.1:9000',
}

/** Sui explorer base (coin/object links in the result screen). */
export function explorerObjectUrl(network: Network, id: string): string {
  return `https://suiscan.xyz/${network}/object/${id}`
}

/**
 * The trivial fee (MIST), split from the user's gas coin into the operator
 * treasury inside the publish PTB. Override with VITE_FEE_MIST.
 */
export const FEE_MIST: bigint = BigInt(env.VITE_FEE_MIST || '1000000000') // 1 SUI default

const ZERO_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000000'

/** Operator treasury per network (set VITE_FEE_TREASURY_* before launch). */
export const FEE_TREASURY: Record<Network, string> = {
  mainnet: env.VITE_FEE_TREASURY_MAINNET || ZERO_ADDR,
  testnet: env.VITE_FEE_TREASURY_TESTNET || ZERO_ADDR,
  localnet: env.VITE_FEE_TREASURY_LOCALNET || ZERO_ADDR,
}

/** True when a real treasury has been configured for the network. */
export function isFeeConfigured(network: Network): boolean {
  return FEE_TREASURY[network] !== ZERO_ADDR
}

/** Gas budget for the publish transaction (MIST). */
export const PUBLISH_GAS_BUDGET: bigint = BigInt(env.VITE_PUBLISH_GAS_BUDGET || '500000000')

/** Networks selectable in the UI. Ship testnet first. */
export const SELECTABLE_NETWORKS: Network[] = ['testnet', 'mainnet']

// ---------------------------------------------------------------------------
// Walrus icon-upload configuration
// ---------------------------------------------------------------------------
// Walrus is a separate protocol from Sui; only testnet/mainnet exist (no
// localnet). Icon uploads go through an upload relay (direct-to-storage-node
// writes fail from browsers). See `src/lib/walrus.ts` and the relay runbook in
// README.md / CLAUDE.md for the operator side.

/** A Walrus network — a strict subset of {@link Network} (no localnet). */
export type WalrusNetwork = 'testnet' | 'mainnet'

/** Public Mysten-operated upload relays — the fallback when no operator relay is set. */
export const PUBLIC_WALRUS_RELAY_HOSTS: Record<WalrusNetwork, string> = {
  testnet: 'https://upload-relay.testnet.walrus.space',
  mainnet: 'https://upload-relay.mainnet.walrus.space',
}

/**
 * Upload relay host per Walrus network.
 *
 * Fallback order: `VITE_WALRUS_RELAY_*` (the operator's own relay — the only way
 * to *collect* the native tip as revenue) → the public Mysten relay. Uploads
 * through the public relay still work but tip Mysten, not the operator, so they
 * earn nothing. A user may also override this at runtime by entering a relay URL.
 */
export const WALRUS_RELAY_HOSTS: Record<WalrusNetwork, string> = {
  testnet: env.VITE_WALRUS_RELAY_TESTNET || PUBLIC_WALRUS_RELAY_HOSTS.testnet,
  mainnet: env.VITE_WALRUS_RELAY_MAINNET || PUBLIC_WALRUS_RELAY_HOSTS.mainnet,
}

/** True when an operator-owned relay (not the public fallback) is configured. */
export function isOperatorRelayConfigured(network: WalrusNetwork): boolean {
  return WALRUS_RELAY_HOSTS[network] !== PUBLIC_WALRUS_RELAY_HOSTS[network]
}

/**
 * gRPC fullnode URL for the Walrus icon-upload client (a `SuiGrpcClient`).
 *
 * IMPORTANT: this is a **gRPC** endpoint and is intentionally *separate* from
 * {@link RPC_URLS} (the JSON-RPC endpoints used by the deploy path). The two protocols
 * are not interchangeable — pointing the Walrus gRPC client at a JSON-RPC URL breaks it —
 * so this has its own `VITE_WALRUS_RPC_*` override rather than reusing `VITE_RPC_*`.
 * Defaults to the public gRPC fullnodes (rate-limited); set your own for production.
 */
export const WALRUS_RPC_URLS: Record<WalrusNetwork, string> = {
  testnet: env.VITE_WALRUS_RPC_TESTNET || 'https://fullnode.testnet.sui.io:443',
  mainnet: env.VITE_WALRUS_RPC_MAINNET || 'https://fullnode.mainnet.sui.io:443',
}

/**
 * Maximum relay tip the client will pay, in MIST.
 *
 * COUPLING CONSTRAINT: the Walrus SDK **hard-fails** an upload (throws) if the
 * relay's configured tip exceeds this value. It must therefore be set with
 * generous headroom *above* whatever tip the operator's relay charges — raising
 * the relay tip past this ceiling breaks uploads until the frontend is
 * redeployed with a higher value. Default 0.05 SUI: comfortably above a
 * cents-scale icon tip, well below anything a user would object to.
 */
export const WALRUS_MAX_TIP_MIST: bigint = BigInt(env.VITE_WALRUS_MAX_TIP_MIST || '50000000')

// ---------------------------------------------------------------------------
// NFT-gated relay access (optional)
// ---------------------------------------------------------------------------
// When the operator relay runs behind an `nft-gate` gateway, using it requires
// holding the gate's access NFT. Configure the gate per network via env; when a
// gate is NOT configured the relay behaves exactly as before (no gating). See
// `src/lib/accessGate.ts` and `useAccessGate`.

function parseAccessGate(network: WalrusNetwork): AccessGateConfig | null {
  const NET = network.toUpperCase()
  const packageId = env[`VITE_ACCESS_GATE_PACKAGE_${NET}`]
  const gateId = env[`VITE_ACCESS_GATE_ID_${NET}`]
  const nftType = env[`VITE_ACCESS_GATE_NFT_TYPE_${NET}`]
  if (!packageId || !gateId || !nftType) return null
  return {
    packageId,
    gateId,
    nftType,
    soulbound: (env[`VITE_ACCESS_GATE_SOULBOUND_${NET}`] ?? 'true') !== 'false',
    priceMist: BigInt(env[`VITE_ACCESS_GATE_PRICE_MIST_${NET}`] || '0'),
  }
}

/** The access gate per Walrus network, or `null` when gating is not configured. */
export const ACCESS_GATE: Record<WalrusNetwork, AccessGateConfig | null> = {
  testnet: parseAccessGate('testnet'),
  mainnet: parseAccessGate('mainnet'),
}

/** True when an NFT gate is configured for the network's operator relay. */
export function isAccessGateConfigured(network: WalrusNetwork): boolean {
  return ACCESS_GATE[network] !== null
}

/**
 * Maximum icon file size, in bytes (default 100 KiB).
 *
 * This is a UX / predictable-cost guard only — NOT a security control. The
 * authoritative cap is a hard request-body limit at the edge (Cloudflare /
 * reverse proxy in front of the relay); a malicious client bypasses this one.
 */
export const ICON_MAX_BYTES: number = Number(env.VITE_ICON_MAX_BYTES || String(100 * 1024))

/** Accepted icon MIME types (override via `VITE_ICON_ALLOWED_TYPES`, comma-separated). */
export const ICON_ALLOWED_TYPES: string[] = (
  env.VITE_ICON_ALLOWED_TYPES || 'image/png,image/jpeg,image/webp,image/svg+xml'
)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)

/**
 * Validate a chosen icon file against the {@link ICON_ALLOWED_TYPES} /
 * {@link ICON_MAX_BYTES} gate. Returns a user-facing error message, or `null`
 * when the file is acceptable.
 *
 * UX / predictable-cost guard only — NOT a security control (a malicious client
 * bypasses it; the authoritative cap is the edge request-body limit).
 */
export function validateIconFile(file: { type: string; size: number }): string | null {
  if (ICON_ALLOWED_TYPES.length && !ICON_ALLOWED_TYPES.includes(file.type)) {
    const allowed = ICON_ALLOWED_TYPES.map((t) => t.replace('image/', '')).join(', ')
    return `Unsupported image type${file.type ? ` (${file.type})` : ''}. Allowed: ${allowed}.`
  }
  if (file.size > ICON_MAX_BYTES) {
    return `Image is too large (${Math.round(file.size / 1024)} KB). Maximum is ${Math.round(
      ICON_MAX_BYTES / 1024,
    )} KB.`
  }
  return null
}
