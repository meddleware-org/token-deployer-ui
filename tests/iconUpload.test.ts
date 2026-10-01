import { describe, it, expect } from 'vitest'
import { accessGateDeployment } from '@meddleware/access-gate-client/deployments'
import { ICON_MAX_BYTES, parseAccessGate, validateIconFile } from '../src/config.js'

// The upload itself is @meddleware/walrus-client/flow and the relay gate @meddleware/walrus-relay
// (tested there). These cover what this app adds: the icon checks and its gate configuration.

describe('validateIconFile (UX/cost gate — not a security control)', () => {
  it('accepts an in-spec PNG', () => {
    expect(validateIconFile({ type: 'image/png', size: 10 * 1024 })).toBeNull()
  })

  it('rejects a disallowed MIME type', () => {
    const msg = validateIconFile({ type: 'application/pdf', size: 1024 })
    expect(msg).toMatch(/Unsupported image type/)
    expect(msg).toContain('pdf')
  })

  it('rejects a file over the size cap', () => {
    expect(validateIconFile({ type: 'image/png', size: ICON_MAX_BYTES + 1 })).toMatch(/too large/)
  })

  it('accepts a file exactly at the cap', () => {
    expect(validateIconFile({ type: 'image/webp', size: ICON_MAX_BYTES })).toBeNull()
  })
})

describe('parseAccessGate', () => {
  it('is ungated without a gate id', () => {
    expect(parseAccessGate('testnet', {})).toBeNull()
  })

  it('takes the package and PlatformConfig from the deployment; soulbound by default', () => {
    const d = accessGateDeployment('testnet')
    const gate = parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate', VITE_ACCESS_GATE_PRICE_MIST_TESTNET: '5' })
    expect(gate).toEqual({
      packageId: d.publishedAt,
      platformConfigId: d.platformConfigId,
      nftType: `${d.originalId}::access_gate::SoulboundAccessNFT`,
      gateId: '0xgate',
      soulbound: true,
      priceMist: 5n,
    })
    expect(parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate', VITE_ACCESS_GATE_SOULBOUND_TESTNET: 'false' })!.nftType).toBe(
      `${d.originalId}::access_gate::AccessNFT`,
    )
  })

  it('is ungated on a network without a recorded deployment', () => {
    expect(parseAccessGate('mainnet', { VITE_ACCESS_GATE_ID_MAINNET: '0xgate' })).toBeNull()
  })
})
