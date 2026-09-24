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
  return {
    data: {
      objectId,
      content: {
        fields: {
          data: {
            fields: {
              gate_id: gateId,
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
    expect(parseOwnedAccessNft({ data: { objectId: '0x9', content: { fields: {} } } })).toBeNull()
  })

  it('fetchAccessNfts filters by gate and passes the StructType filter', async () => {
    const client: OwnedObjectsClient = {
      getOwnedObjects: vi.fn(async () => ({
        data: [entry('0x1', GATE), entry('0x2', '0xother', 1)],
      })),
    }
    const nfts = await fetchAccessNfts(client, '0xowner', NFT_TYPE, GATE)
    expect(nfts).toHaveLength(1)
    expect(nfts[0].objectId).toBe('0x1')
    expect(client.getOwnedObjects).toHaveBeenCalledWith(
      expect.objectContaining({ owner: '0xowner', filter: { StructType: NFT_TYPE } }),
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
