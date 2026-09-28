import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseOwnedAccessNft,
  fetchAccessNfts,
  buildPurchaseTx,
  buildConsumeTx,
  personalMessageForNonce,
  buildAccessProofToken,
  fetchRelayChallenge,
} from '../src/lib/accessGate.js'
import type { AccessGateConfig, OwnedObjectsClient } from '../src/lib/accessGate.js'

afterEach(() => vi.restoreAllMocks())

const PKG = '0x00000000000000000000000000000000000000000000000000000000000000aa'
const GATE = '0x00000000000000000000000000000000000000000000000000000000000000a1'
const NFT_TYPE = `${PKG}::access_gate::AccessNFT`

const cfg: AccessGateConfig = {
  packageId: PKG,
  gateId: GATE,
  nftType: NFT_TYPE,
  soulbound: false,
  priceMist: 1000n,
}

function entry(objectId: string, gateId: string, uses?: number) {
  // Core (gRPC) shape: struct fields are flat under `json`.
  return {
    objectId,
    json: {
      data: {
        gate_id: gateId,
        variant:
          uses === undefined
            ? { variant: 'UnlimitedPass', fields: {} }
            : { variant: 'SingleUse', fields: { uses_remaining: String(uses) } },
      },
    },
  }
}

function commandsJson(tx: { getData: () => unknown }): string {
  return JSON.stringify(tx.getData())
}

describe('accessGate lib', () => {
  it('parses unlimited pass and single-use NFTs', () => {
    expect(parseOwnedAccessNft(entry('0x1', GATE))).toEqual({
      objectId: '0x1',
      gateId: GATE,
      usesRemaining: null,
    })
    expect(parseOwnedAccessNft(entry('0x2', GATE, 5))?.usesRemaining).toBe(5)
    expect(parseOwnedAccessNft({ objectId: '0x9', json: {} })).toBeNull()
  })

  it('still parses the legacy JSON-RPC nested `.fields` shape', () => {
    const legacy = {
      objectId: '0x3',
      json: { fields: { data: { fields: { gate_id: GATE, variant: { variant: 'SingleUse', fields: { uses_remaining: '2' } } } } } },
    }
    expect(parseOwnedAccessNft(legacy)).toEqual({ objectId: '0x3', gateId: GATE, usesRemaining: 2 })
  })

  it('fetchAccessNfts filters by gate and passes the type filter', async () => {
    const client: OwnedObjectsClient = {
      core: {
        listOwnedObjects: vi.fn(async () => ({
          objects: [entry('0x1', GATE), entry('0x2', '0xother', 1)],
        })),
      },
    }
    const nfts = await fetchAccessNfts(client, '0xowner', NFT_TYPE, GATE)
    expect(nfts).toHaveLength(1)
    expect(nfts[0].objectId).toBe('0x1')
    expect(client.core.listOwnedObjects).toHaveBeenCalledWith(
      expect.objectContaining({ owner: '0xowner', type: NFT_TYPE, include: { json: true } }),
    )
  })

  it('buildPurchaseTx splits gas and calls purchase', () => {
    const json = commandsJson(buildPurchaseTx(cfg))
    expect(json).toContain('SplitCoins')
    expect(json).toContain('"function":"purchase"')
  })

  it('buildConsumeTx selects consume vs consume_soulbound', () => {
    expect(commandsJson(buildConsumeTx(cfg, '0x1', 'n'))).toContain('"function":"consume"')
    expect(commandsJson(buildConsumeTx({ ...cfg, soulbound: true }, '0x1', 'n'))).toContain(
      '"function":"consume_soulbound"',
    )
  })

  it('encodes the proof token and message', () => {
    expect(new TextDecoder().decode(personalMessageForNonce('x'))).toBe('nft-gate:access:x')
    const token = buildAccessProofToken({ address: '0x1', nonce: 'n', signature: 's', consumeDigest: 'd' })
    expect(JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))).toEqual({
      address: '0x1',
      nonce: 'n',
      signature: 's',
      consumeDigest: 'd',
    })
  })

  it('fetchRelayChallenge parses the gateway response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ nonce: 'abc', expiresAt: 7 }), { status: 200 })),
    )
    expect(await fetchRelayChallenge('https://relay.example')).toEqual({ nonce: 'abc', expiresAt: 7 })
  })
})
