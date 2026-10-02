import { describe, it, expect, vi } from 'vitest'
import type { Executor } from '@meddleware/sui-token-client/deploy'
import type { TokenConfig } from '@meddleware/sui-token-client'
import { useDeploy } from '../src/composables/useDeploy.js'

const sender = '0x' + '1'.repeat(64)
const treasury = '0x' + '2'.repeat(64)
const PKG = '0x' + 'a1'.repeat(32)
const COIN = `${PKG}::mytoken::MYTOKEN`

const config: TokenConfig = {
  packageName: 'my_token', moduleName: 'mytoken', structName: 'MYTOKEN', symbol: 'MTK', name: 'My Token',
  description: '', iconUrl: '', decimals: 9, initialSupply: 0n, supplyPolicy: 'mintable',
  metadataPolicy: 'updatable', packagePolicy: 'immutable', recipient: sender, license: 'MIT',
  packageDescription: '', projectName: '',
}

const published = {
  digest: 'PUBDIGEST',
  effects: { status: { status: 'success' } },
  objectChanges: [
    { type: 'published', packageId: PKG },
    { type: 'created', objectType: `0x2::coin::TreasuryCap<${COIN}>`, objectId: '0x' + 'b'.repeat(64) },
    { type: 'created', objectType: `0x2::coin_registry::MetadataCap<${COIN}>`, objectId: '0x' + 'c'.repeat(64) },
    { type: 'created', objectType: `0x2::coin_registry::Currency<${COIN}>`, objectId: '0x' + 'd'.repeat(64), version: '1', digest: '11111111111111111111111111111111' },
  ],
}
const ok = { digest: 'FINDIGEST', objectChanges: [], effects: { status: { status: 'success' } } }

type Sign = Executor['signAndExecute']
function executor(sign: Sign, wait: Executor['waitForTransaction'] = vi.fn(async () => {})): Executor {
  return { signAndExecute: sign, waitForTransaction: wait }
}
const args = { config, network: 'testnet' as const, sender, feeMist: 0n, feeTreasury: treasury, gasBudget: 1n }

describe('useDeploy', () => {
  it('a refused second signature leaves the coin incomplete, and finish() completes it', async () => {
    const first = executor(vi.fn<Sign>().mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('User rejected')))
    const retry = executor(vi.fn<Sign>().mockResolvedValue(ok))
    const executorFor = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(retry)
    const flow = useDeploy(executorFor)

    await flow.deploy(args)
    expect(flow.phase.value).toBe('incomplete')
    expect(flow.pending.value?.result.coinType).toBe(COIN)
    expect(flow.error.value).toMatch(/finishing its setup failed: User rejected/)

    await flow.finish()
    expect(flow.phase.value).toBe('done')
    expect(flow.result.value?.coinType).toBe(COIN)
    expect(flow.pending.value).toBeNull()
    expect(retry.signAndExecute).toHaveBeenCalledTimes(1) // finalize only — no second publish
    expect(executorFor).toHaveBeenLastCalledWith('testnet') // the network the coin was published to
  })

  it('stays incomplete when finishing fails again', async () => {
    const executorFor = vi
      .fn()
      .mockResolvedValueOnce(executor(vi.fn<Sign>().mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('no'))))
      .mockResolvedValueOnce(executor(vi.fn<Sign>().mockRejectedValue(new Error('still no'))))
    const flow = useDeploy(executorFor)
    await flow.deploy(args)
    await flow.finish()
    expect(flow.phase.value).toBe('incomplete')
    expect(flow.pending.value).not.toBeNull()
  })

  it('a failure before publishing returns to a fresh deploy', async () => {
    const flow = useDeploy(vi.fn().mockResolvedValue(executor(vi.fn<Sign>().mockRejectedValue(new Error('User rejected')))))
    await flow.deploy(args)
    expect(flow.phase.value).toBe('failed')
    expect(flow.pending.value).toBeNull()
  })

  it('unreadable publish effects never offer a deploy or retry', async () => {
    const sign = vi.fn<Sign>().mockResolvedValue({ digest: 'PUBDIGEST', objectChanges: [], effects: { status: { status: 'success' } } })
    const flow = useDeploy(vi.fn().mockResolvedValue(executor(sign)))
    await flow.deploy(args)
    expect(flow.phase.value).toBe('published')
    expect(flow.publishDigest.value).toBe('PUBDIGEST')
  })

  it('an executed but unconfirmed setup counts as done, with the warning kept', async () => {
    const wait = vi.fn<Executor['waitForTransaction']>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('timeout'))
    const flow = useDeploy(vi.fn().mockResolvedValue(executor(vi.fn<Sign>().mockResolvedValueOnce(published).mockResolvedValueOnce(ok), wait)))
    await flow.deploy(args)
    expect(flow.phase.value).toBe('done')
    expect(flow.result.value?.coinType).toBe(COIN)
    expect(flow.error.value).toMatch(/confirmation failed: timeout/)
  })
})
