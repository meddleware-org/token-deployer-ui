// Consume persistence for the single-use NFT relay paywall (same contract as walrus-ui's
// access-resume): the gateway treats the permanent on-chain consume digest as the one-time
// redemption token, so an interrupted icon upload must REUSE the digest instead of spending a new
// use. The digest is stored before the upload, reused on retry, replaced only after the gateway
// reports it redeemed (HTTP 409 `code: "redeemed"`), and cleared once an upload succeeds.

/** The subset of the Web Storage API this module needs (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Per-(network, gate, address) key under which the pending consume digest is stored. */
export function consumeStorageKey(network: string, gateId: string, address: string): string {
  return `mw:token-deployer:consume:${network}:${gateId}:${address}`
}

/**
 * True if `err` is the gateway's "this consume was already redeemed" rejection. Only this — never
 * a transient failure — justifies spending a fresh use.
 */
export function isRedeemedConflict(err: unknown): boolean {
  const e = err as
    | { status?: number; error?: { code?: string }; message?: string; cause?: unknown }
    | null
  if (!e) return false
  if (e.status === 409 && e.error?.code === 'redeemed') return true
  if (typeof e.message === 'string' && /\b409\b/.test(e.message) && /redeemed/.test(e.message)) {
    return true
  }
  return e.cause !== undefined && e.cause !== e && isRedeemedConflict(e.cause)
}

/**
 * Return the consume digest to present: the stored one when present (and not `forceFresh`),
 * otherwise a new one from `consume()`, persisted before it is returned.
 */
export async function resolveConsumeDigest(deps: {
  storage: StorageLike
  key: string
  consume: () => Promise<string>
  forceFresh?: boolean
}): Promise<string> {
  const stored = deps.forceFresh ? null : deps.storage.getItem(deps.key)
  if (stored) return stored
  const digest = await deps.consume()
  deps.storage.setItem(deps.key, digest)
  return digest
}

/** Browser storage when available; an in-memory fallback otherwise (private mode, tests). */
export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__mw_probe__'
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
      return localStorage
    }
  } catch {
    // Storage blocked (private mode / quota): fall through to the in-memory store below.
  }
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}
