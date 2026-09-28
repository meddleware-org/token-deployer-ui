import { describe, it, expect, vi } from 'vitest'

const listOwnedObjects = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/readClient.js', () => ({
  getReadClient: () => ({ listOwnedObjects }),
}))

import { listMyTokens } from '../src/lib/listMyTokens.js'

const PKG = '0x' + 'ab'.repeat(32)

describe('listMyTokens', () => {
  it('queries owned TreasuryCaps and parses short- and long-form framework types', async () => {
    listOwnedObjects.mockResolvedValue({
      objects: [
        { objectId: '0x1', type: `0x2::coin::TreasuryCap<${PKG}::a::A>` },
        { objectId: '0x2', type: `0x${'0'.repeat(63)}2::coin::TreasuryCap<${PKG}::b::B>` },
        // duplicate coin type and an unrelated type are skipped
        { objectId: '0x3', type: `0x2::coin::TreasuryCap<${PKG}::a::A>` },
        { objectId: '0x4', type: '0x2::coin::Coin<0x2::sui::SUI>' },
      ],
    })
    const tokens = await listMyTokens('0xowner', 'testnet')
    expect(listOwnedObjects).toHaveBeenCalledWith({ owner: '0xowner', type: '0x2::coin::TreasuryCap' })
    expect(tokens).toEqual([
      { coinType: `${PKG}::a::A`, packageId: PKG, treasuryCapId: '0x1', label: 'A' },
      { coinType: `${PKG}::b::B`, packageId: PKG, treasuryCapId: '0x2', label: 'B' },
    ])
  })
})
