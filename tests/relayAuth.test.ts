import { describe, expect, it, vi } from 'vitest'
import { relayAuthFetch } from '../src/lib/walrus'
import {
  consumeStorageKey,
  isRedeemedConflict,
  resolveConsumeDigest,
  type StorageLike,
} from '../src/lib/consumeResume'

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('relayAuthFetch', () => {
  const relay = 'https://relay.example.com'

  it('adds the bearer token to relay-origin requests only', async () => {
    const base = vi.fn(async () => new Response('ok'))
    const f = relayAuthFetch(relay, 'TOKEN', base as unknown as typeof fetch)
    await f(`${relay}/v1/blob-upload-relay?x=1`, { method: 'POST' })
    await f('https://aggregator.example.com/v1/blobs/abc')
    const first = base.mock.calls[0] as unknown as [string, RequestInit]
    const second = base.mock.calls[1] as unknown as [string, RequestInit | undefined]
    expect(new Headers(first[1].headers).get('Authorization')).toBe('Bearer TOKEN')
    expect(new Headers(second[1]?.headers).get('Authorization')).toBeNull()
  })

  it('resolves a provider per request and skips the header when it returns nothing', async () => {
    const base = vi.fn(async () => new Response('ok'))
    const state: { token?: string } = {}
    const f = relayAuthFetch(relay, () => state.token, base as unknown as typeof fetch)
    await f(`${relay}/v1/tip-config`)
    state.token = 'LATER'
    await f(`${relay}/v1/tip-config`)
    const calls = base.mock.calls as unknown as [string, RequestInit | undefined][]
    expect(new Headers(calls[0][1]?.headers).get('Authorization')).toBeNull()
    expect(new Headers(calls[1][1]?.headers).get('Authorization')).toBe('Bearer LATER')
  })

  it('never sends the token over plain http to a non-local host', () => {
    const f = relayAuthFetch('http://relay.example.com', 'TOKEN', vi.fn() as unknown as typeof fetch)
    expect(() => f('http://relay.example.com/v1/tip-config')).toThrow(/non-https/)
  })
})

describe('consume resume', () => {
  it('consumes once, then reuses the stored digest', async () => {
    const storage = memStorage()
    const key = consumeStorageKey('testnet', '0xgate', '0xme')
    const consume = vi.fn(async () => 'DIGEST1')
    expect(await resolveConsumeDigest({ storage, key, consume })).toBe('DIGEST1')
    expect(await resolveConsumeDigest({ storage, key, consume })).toBe('DIGEST1')
    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('consumes a fresh use only when forced (after a redeemed conflict)', async () => {
    const storage = memStorage()
    const key = consumeStorageKey('testnet', '0xgate', '0xme')
    storage.setItem(key, 'OLD')
    const digest = await resolveConsumeDigest({
      storage,
      key,
      forceFresh: true,
      consume: async () => 'NEW',
    })
    expect(digest).toBe('NEW')
    expect(storage.getItem(key)).toBe('NEW')
  })

  it('recognises the gateway redeemed conflict and nothing else', () => {
    expect(isRedeemedConflict({ status: 409, error: { code: 'redeemed' } })).toBe(true)
    expect(isRedeemedConflict(new Error('Upload failed: 409 {"code":"redeemed"}'))).toBe(true)
    expect(isRedeemedConflict({ status: 409, error: { code: 'leased' } })).toBe(false)
    expect(isRedeemedConflict(new Error('network error'))).toBe(false)
  })
})
