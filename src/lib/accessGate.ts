// Client-side helpers for the `access_gate` NFT primitive that gates the operator's
// upload relay: ownership queries, purchase/consume PTB builders, and the wallet-signed
// access-proof token.
//
// Self-contained (this app is standalone). The wire format mirrors
// `@meddleware/nft-gate-client` and `@meddleware/sui-walrus`'s access helpers; the
// `nft-gate` gateway is the authority that verifies these proofs.
//
// TODO(unify): consume `@meddleware/nft-gate-client` once published and drop the duplication.

import { Transaction } from '@mysten/sui/transactions'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Deployed gate + the NFT type that satisfies it. */
export interface AccessGateConfig {
  packageId: string
  gateId: string
  /** `<pkg>::access_gate::AccessNFT` or `…::SoulboundAccessNFT`. */
  nftType: string
  soulbound: boolean
  /** Purchase price in MIST. */
  priceMist: bigint
}

export interface OwnedAccessNft {
  objectId: string
  gateId: string
  /** `null` = unlimited pass; otherwise remaining single-use count. */
  usesRemaining: number | null
}

/** Minimal structural subset of the core (gRPC) client used here. */
export interface OwnedObjectsClient {
  core: {
    listOwnedObjects(params: {
      owner: string
      type?: string
      include?: { json?: boolean }
    }): Promise<{ objects: unknown[] }>
  }
}

/**
 * Unwrap a Move-struct field bag from a core `json` value. The gRPC/core API returns struct
 * fields flat; the old JSON-RPC shape nested them under `.fields`. Tolerate both.
 */
function structFields(v: unknown): Record<string, any> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, any>
  const nested = o.fields
  return nested && typeof nested === 'object' ? (nested as Record<string, any>) : o
}

function parseUsesRemaining(variant: any): number | null {
  if (variant == null) return null
  const tag: string | undefined = variant.variant ?? variant.type ?? variant.$kind
  if (tag === 'UnlimitedPass') return null
  const fields = variant.fields ?? variant
  const ur = fields?.uses_remaining ?? fields?.SingleUse?.uses_remaining
  return ur != null ? Number(ur) : null
}

/** Parse a `listOwnedObjects` entry into an access NFT, or `null` if it isn't one. */
export function parseOwnedAccessNft(entry: any): OwnedAccessNft | null {
  const objectId: string | undefined = entry?.objectId
  const inner = structFields(structFields(entry?.json)?.data)
  const gateId: string | undefined = inner?.gate_id ?? inner?.gateId
  if (!objectId || !gateId) return null
  return { objectId, gateId, usesRemaining: parseUsesRemaining(inner?.variant) }
}

/** All access NFTs of `nftType` owned by `owner`, optionally restricted to `gateId`. */
export async function fetchAccessNfts(
  client: OwnedObjectsClient,
  owner: string,
  nftType: string,
  gateId?: string,
): Promise<OwnedAccessNft[]> {
  const { objects } = await client.core.listOwnedObjects({
    owner,
    type: nftType,
    include: { json: true },
  })
  const parsed = (objects ?? [])
    .map(parseOwnedAccessNft)
    .filter((n): n is OwnedAccessNft => n !== null)
  return gateId ? parsed.filter((n) => n.gateId === gateId) : parsed
}

/** Build a PTB that buys access (splits the exact price from gas → `purchase`). */
export function buildPurchaseTx(cfg: AccessGateConfig): Transaction {
  const tx = new Transaction()
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(cfg.priceMist)])
  tx.moveCall({
    target: `${cfg.packageId}::access_gate::purchase`,
    arguments: [tx.object(cfg.gateId), payment],
  })
  return tx
}

/** Build a PTB that consumes one single-use, binding it to `nonce`. */
export function buildConsumeTx(cfg: AccessGateConfig, nftId: string, nonce: string): Transaction {
  const tx = new Transaction()
  const fn = cfg.soulbound ? 'consume_soulbound' : 'consume'
  const nonceBytes = Array.from(new TextEncoder().encode(nonce))
  tx.moveCall({
    target: `${cfg.packageId}::access_gate::${fn}`,
    arguments: [tx.object(nftId), tx.object(cfg.gateId), tx.pure.vector('u8', nonceBytes)],
  })
  return tx
}

// ── Challenge / proof (mirror of the gateway's wire format) ───────────────────────

export interface RelayChallenge {
  nonce: string
  expiresAt: number
}

export type PersonalMessageSigner = (message: Uint8Array) => Promise<{ signature: string }>

export function personalMessageForNonce(nonce: string): Uint8Array {
  return new TextEncoder().encode(`nft-gate:access:${nonce}`)
}

/** UTF-8-safe base64 (byte-identical to `btoa` for ASCII, which is what the wire format carries). */
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** https, or plain http only for a local development host. */
export function isSecureOrLocal(url: URL): boolean {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
}

/** Printable ASCII only (the gateway issues `<region>.<hex>` nonces). */
const ASCII_TOKEN = /^[\x21-\x7e]{1,256}$/

export function buildAccessProofToken(proof: {
  address: string
  nonce: string
  signature: string
  consumeDigest?: string
}): string {
  const payload: Record<string, string> = {
    address: proof.address,
    nonce: proof.nonce,
    signature: proof.signature,
  }
  if (proof.consumeDigest) payload.consumeDigest = proof.consumeDigest
  return toBase64(JSON.stringify(payload))
}

export async function fetchRelayChallenge(
  relayHost: string,
  opts: { signal?: AbortSignal } = {},
): Promise<RelayChallenge> {
  const url = new URL('/v1/challenge', relayHost)
  if (!isSecureOrLocal(url)) throw new Error(`relay host must be https (${relayHost})`)
  const res = await fetch(url, { signal: opts.signal ?? AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`challenge request failed: ${res.status}`)
  const data = (await res.json()) as { nonce?: string; expiresAt?: number; expires_at?: number }
  if (!data || typeof data.nonce !== 'string') throw new Error('challenge response missing nonce')
  if (!ASCII_TOKEN.test(data.nonce)) throw new Error('challenge nonce is not printable ASCII')
  return { nonce: data.nonce, expiresAt: data.expiresAt ?? data.expires_at ?? 0 }
}
