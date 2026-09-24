import { describe, it, expect, vi } from 'vitest'
import { deployToken } from '../src/lib/deploy.js'
import type { Executor, SuiTxResult } from '../src/lib/deploy.js'
import type { TokenConfig } from '../src/lib/types.js'

const sender = '0x' + '1'.repeat(64)
const treasury = '0x' + '2'.repeat(64)

function baseConfig(over: Partial<TokenConfig> = {}): TokenConfig {
  return {
    packageName: 'my_token', moduleName: 'mytoken', structName: 'IGNORED',
    symbol: 'MTK', name: 'My Token', description: 'desc', iconUrl: '', decimals: 9,
    initialSupply: 0n, supplyPolicy: 'mintable', metadataPolicy: 'updatable', packagePolicy: 'immutable',
    recipient: sender, license: 'MIT', packageDescription: '', projectName: '',
    ...over,
  }
}

const publishChanges = (coinType: string): SuiTxResult['objectChanges'] => [
  { type: 'published', packageId: '0xPKG' },
  { type: 'created', objectType: `0x2::coin::TreasuryCap<${coinType}>`, objectId: '0xT' },
  { type: 'created', objectType: `0x2::coin_registry::MetadataCap<${coinType}>`, objectId: '0xM' },
  // version + digest are present in real Sui RPC responses and required for finalize_registration
  { type: 'created', objectType: `0x2::coin_registry::Currency<${coinType}>`, objectId: '0xC', version: '1', digest: 'CURRENCYDIGEST' },
]

function mockExecutor(overrides: Partial<Executor> = {}): Executor {
  const coinType = '0xPKG::mytoken::MYTOKEN'
  return {
    signAndExecute: vi.fn<any>(async () => ({
      digest: '0xDIGEST',
      objectChanges: publishChanges(coinType),
      effects: { status: { status: 'success' } },
    })) as any,
    waitForTransaction: vi.fn<any>(async () => {}) as any,
    ...overrides,
  } as any
}

describe('deployToken', () => {
  it('always runs a finalize tx (for coin_registry::finalize_registration); struct name is derived', async () => {
    const exec = mockExecutor()
    const steps: string[] = []
    const result = await deployToken({
      config: baseConfig(), network: 'testnet', sender, feeMist: 500_000_000n, feeTreasury: treasury,
      gasBudget: 500_000_000n, executor: exec, onStep: (s) => steps.push(s),
    })
    expect(result.coinType).toBe('0xPKG::mytoken::MYTOKEN')
    expect(result.packageId).toBe('0xPKG')
    expect(result.treasuryCapId).toBe('0xT')
    // publish + finalize (finalize_registration is always required)
    expect((exec.signAndExecute as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    expect(steps).toEqual(['patching', 'publishing', 'confirming', 'finalizing', 'confirming-finalize', 'done'])
  })

  it('runs a finalize tx for initial supply as well', async () => {
    const exec = mockExecutor()
    const steps: string[] = []
    await deployToken({
      config: baseConfig({ initialSupply: 1000n }), network: 'testnet', sender,
      feeMist: 0n, feeTreasury: treasury, gasBudget: 500_000_000n, executor: exec,
      onStep: (s) => steps.push(s),
    })
    expect((exec.signAndExecute as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    expect(steps).toContain('finalizing')
  })

  it('throws with the effects error when publish fails', async () => {
    const exec = mockExecutor({
      signAndExecute: vi.fn<any>(async () => ({
        digest: '0xD', objectChanges: [], effects: { status: { status: 'failure', error: 'InsufficientGas' } },
      })) as any,
    })
    await expect(
      deployToken({
        config: baseConfig(), network: 'testnet', sender, feeMist: 0n, feeTreasury: treasury,
        gasBudget: 1n, executor: exec,
      }),
    ).rejects.toThrow(/InsufficientGas/)
  })
})
