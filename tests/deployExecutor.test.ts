import { describe, it, expect, vi } from 'vitest'

// The deploy executor is wallet-adapter's executor (signing, chain check, account binding) run
// through this app's client, asking for the effects + object types the publish result needs.
const { buildExecutor, readClient } = vi.hoisted(() => ({
  buildExecutor: vi.fn(),
  readClient: { __client: 'testnet' },
}))
vi.mock('@meddleware/wallet-adapter', () => ({ buildExecutor }))
vi.mock('../src/lib/readClient.js', () => ({ getReadClient: () => readClient }))

import { buildDeployExecutor } from '../src/lib/deployExecutor.js'
import { RPC_URLS } from '../src/config.js'

describe('buildDeployExecutor', () => {
  it('executes through the app client with effects + object types and maps the publish result', async () => {
    const packageId = '0x' + 'bb'.repeat(32)
    const capId = '0x' + 'cc'.repeat(32)
    const result = {
      $kind: 'Transaction',
      Transaction: {
        digest: 'D1',
        status: { success: true, error: null },
        effects: { changedObjects: [{ objectId: packageId, outputState: 'PackageWrite', idOperation: 'Created' }, { objectId: capId, outputState: 'ObjectWrite', idOperation: 'Created' }] },
        objectTypes: { [capId]: `0x2::coin::TreasuryCap<${packageId}::t::T>` },
      },
    }
    const inner = {
      signAndExecute: vi.fn(async () => ({ digest: 'D1', success: true, result })),
      waitForTransaction: vi.fn(async () => ({})),
    }
    buildExecutor.mockResolvedValue(inner)

    const exec = await buildDeployExecutor('testnet')
    expect(buildExecutor).toHaveBeenCalledWith('testnet', RPC_URLS.testnet, { client: readClient })
    const out = await exec.signAndExecute({} as never)
    expect(inner.signAndExecute).toHaveBeenCalledWith({}, { include: { effects: true, objectTypes: true } })
    expect(out.digest).toBe('D1')
    expect(out.objectChanges).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'published', packageId })]))
    await exec.waitForTransaction('D1')
    expect(inner.waitForTransaction).toHaveBeenCalledWith('D1')
  })

  it('surfaces the wallet-adapter guards (no wallet, wrong chain)', async () => {
    buildExecutor.mockRejectedValue(new Error('The connected wallet account does not support sui:mainnet'))
    await expect(buildDeployExecutor('mainnet')).rejects.toThrow(/does not support sui:mainnet/)
  })
})
