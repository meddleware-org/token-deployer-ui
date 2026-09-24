import { describe, it, expect, vi, afterEach } from 'vitest'
import { useAccessGate } from '../src/composables/useAccessGate.js'
import type { AccessGateConfig, OwnedObjectsClient } from '../src/lib/accessGate.js'

afterEach(() => vi.restoreAllMocks())

const GATE = '0x00000000000000000000000000000000000000000000000000000000000000a1'
const NFT_TYPE = '0xpkg::access_gate::AccessNFT'

const gate: AccessGateConfig = {
  packageId: '0xpkg',
  gateId: GATE,
  nftType: NFT_TYPE,
  soulbound: true,
  priceMist: 1000n,
}

function ownedEntry(uses?: number) {
  return {
    data: {
      objectId: '0xnft',
      content: {
        fields: {
          data: {
            fields: {
              gate_id: GATE,
              variant:
                uses === undefined
                  ? { variant: 'UnlimitedPass', fields: {} }
                  : { variant: 'SingleUse', fields: { uses_remaining: String(uses) } },
            },
          },
        },
      },
    },
  }
}

function clientReturning(data: unknown[]): OwnedObjectsClient {
  return { getOwnedObjects: vi.fn(async () => ({ data })) }
}

describe('useAccessGate', () => {
  it('treats the relay as open when no gate is configured', async () => {
    const g = useAccessGate('testnet', { getClient: () => clientReturning([]), gate: null })
    expect(g.gateConfigured).toBe(false)
    expect(g.hasAccess.value).toBe(true)
    await g.checkOwnership('0xowner')
    expect(g.accessGranted.value).toBe(true)
  })

  it('grants access when the wallet holds the gate NFT', async () => {
    const g = useAccessGate('testnet', { getClient: () => clientReturning([ownedEntry(3)]), gate })
    expect(g.hasAccess.value).toBe(null) // unknown until checked
    await g.checkOwnership('0xowner')
    expect(g.hasAccess.value).toBe(true)
    expect(g.usesRemaining.value).toBe(3)
    expect(g.accessGranted.value).toBe(true)
  })

  it('denies access when the wallet holds no matching NFT', async () => {
    const g = useAccessGate('testnet', { getClient: () => clientReturning([]), gate })
    await g.checkOwnership('0xowner')
    expect(g.hasAccess.value).toBe(false)
    expect(g.accessGranted.value).toBe(false)
  })

  it('surfaces an error and denies (does not throw) when the query fails', async () => {
    const g = useAccessGate('testnet', {
      getClient: () => ({
        getOwnedObjects: vi.fn(async () => {
          throw new Error('rpc down')
        }),
      }),
      gate,
    })
    await g.checkOwnership('0xowner')
    expect(g.hasAccess.value).toBe(false)
    expect(g.error.value).toMatch(/rpc down/)
  })

  it('builds a relay access token by signing the challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nonce: 'the-nonce', expiresAt: 1 }), { status: 200 })),
    )
    const g = useAccessGate('testnet', { getClient: () => clientReturning([]), gate })
    const sign = vi.fn(async (message: Uint8Array) => {
      expect(new TextDecoder().decode(message)).toBe('nft-gate:access:the-nonce')
      return { signature: 'SIG' }
    })
    const token = await g.buildRelayAccessToken({
      relayHost: 'https://relay.example',
      address: '0xowner',
      sign,
      consumeDigest: 'dig',
    })
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    expect(decoded).toEqual({ address: '0xowner', nonce: 'the-nonce', signature: 'SIG', consumeDigest: 'dig' })
  })
})
