import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Stub @meddleware/ui (its prebuilt dist doesn't render under a second Vue runtime in tests).
vi.mock('@meddleware/ui', () => ({
  CopyableAddress: { name: 'CopyableAddress', props: ['address', 'label'], template: '<span>{{ address }}<slot /></span>' },
  ExplorerLink: { name: 'ExplorerLink', props: ['href', 'label'], template: '<a :href="href">{{ label }}</a>' },
  UiNotice: { name: 'UiNotice', props: ['type'], template: '<div class="notice"><slot /></div>' },
  suiExplorerUrl: (network: string, kind: string, id: string) => `https://suivision.example/${network}/${kind}/${id}`,
}))

const { listMyTokens } = vi.hoisted(() => ({ listMyTokens: vi.fn() }))
vi.mock('@meddleware/sui-token-client', () => ({ listMyTokens }))

import MyTokens from '../src/components/MyTokens.vue'

const token = (name: string) => ({
  coinType: `0x1::${name}::${name.toUpperCase()}`,
  packageId: '0x1',
  treasuryCapId: `0x${name.length}`,
  symbol: name.toUpperCase(),
  name,
})

/** A promise that resolves when the test says so. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => listMyTokens.mockReset())

describe('MyTokens', () => {
  it('reloads when the network changes for the same account', async () => {
    listMyTokens.mockResolvedValueOnce([token('tst')]).mockResolvedValueOnce([token('mainx')])
    const w = mount(MyTokens, { props: { owner: '0xabc', network: 'testnet' } })
    await flushPromises()
    expect(w.text()).toContain('0x1::tst::TST')
    await w.setProps({ network: 'mainnet' })
    await flushPromises()
    expect(listMyTokens).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('0x1::mainx::MAINX')
    expect(w.text()).not.toContain('0x1::tst::TST')
  })

  it("drops a slow result for the previous account instead of showing it under the new one", async () => {
    const first = deferred<unknown[]>()
    listMyTokens.mockImplementationOnce(() => first.promise).mockImplementationOnce(async () => [token('bob')])
    const w = mount(MyTokens, { props: { owner: '0xa11ce', network: 'testnet' } })
    await w.setProps({ owner: '0xb0b' })
    await flushPromises()
    first.resolve([token('alice')])
    await flushPromises()
    expect(w.text()).toContain('0x1::bob::BOB')
    expect(w.text()).not.toContain('alice')
  })

  it('clears the list when the wallet disconnects', async () => {
    listMyTokens.mockResolvedValue([token('tst')])
    const w = mount(MyTokens, { props: { owner: '0xabc', network: 'testnet' } })
    await flushPromises()
    await w.setProps({ owner: null })
    await flushPromises()
    expect(w.text()).not.toContain('0x1::tst::TST')
  })

  it('shows a coin with no capability (fixed supply, frozen metadata) with both caps marked absent', async () => {
    listMyTokens.mockResolvedValue([{ coinType: '0x1::fixed::FIXED', packageId: '0x1', label: 'FIXED' }])
    const w = mount(MyTokens, { props: { owner: '0xabc', network: 'testnet' } })
    await flushPromises()
    expect(w.text()).toContain('0x1::fixed::FIXED')
    expect(w.text()).toMatch(/Treasury cap\s*None — the supply is fixed/)
    expect(w.text()).toMatch(/Metadata cap\s*None — the metadata is frozen/)
  })

  it('shows the metadata cap of a coin whose treasury cap went elsewhere', async () => {
    listMyTokens.mockResolvedValue([{ coinType: '0x1::m::M', packageId: '0x1', metadataCapId: '0xbeef', label: 'M' }])
    const w = mount(MyTokens, { props: { owner: '0xabc', network: 'testnet' } })
    await flushPromises()
    expect(w.text()).toContain('0xbeef')
    expect(w.text()).toMatch(/Treasury cap\s*None/)
  })
})
