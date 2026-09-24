import { describe, it, expect, vi } from 'vitest'
import { readonly, isReadonly } from 'vue'

// Reproduces a real Sui wallet extension: `name`/`icon` are getters backed by an
// ES private field, so they throw ("attempted to get private field on
// non-instance") if invoked with a Vue reactive/readonly Proxy as `this`. Plain
// object literals (like our e2e mock) do NOT have this property, which is why the
// bug only surfaced with actual installed wallets.
class PrivateFieldWallet {
  #name = 'Slush'
  #icon = 'data:image/svg+xml;base64,AAAA'
  get name() {
    return this.#name
  }
  get icon() {
    return this.#icon
  }
  version = '1.0.0'
  chains = ['sui:testnet']
  accounts = [
    {
      address: '0x' + '1'.repeat(64),
      publicKey: new Uint8Array(),
      chains: ['sui:testnet'],
      features: ['sui:signTransaction'],
      label: 'Account 1',
    },
  ]
  features = {
    'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: this.accounts }) },
    'standard:events': { version: '1.0.0', on: () => () => {} },
    'sui:signTransaction': { version: '2.0.0', signTransaction: async () => ({ bytes: '', signature: '' }) },
    'sui:signPersonalMessage': {
      version: '1.0.0',
      signPersonalMessage: async () => ({ bytes: '', signature: 'PMSIG' }),
    },
  }
}

const wallet = new PrivateFieldWallet()

vi.mock('@mysten/wallet-standard', () => ({
  getWallets: () => ({ get: () => [wallet], on: () => {} }),
  isWalletWithRequiredFeatureSet: () => true,
}))

describe('useWallet with real extension wallets (private-field getters)', () => {
  it('sanity: a private-field getter DOES throw through a Vue readonly Proxy', () => {
    // This is the exact failure the composable must avoid; if this ever stops
    // throwing the guard below is testing nothing.
    const proxied = readonly(new PrivateFieldWallet()) as PrivateFieldWallet
    expect(() => proxied.name).toThrow('Cannot read private member')
  })

  it('exposes discovered wallets un-proxied so name/icon read safely', async () => {
    const { useWallet } = await import('@meddleware/wallet-adapter')
    const { wallets } = useWallet()
    const list = wallets.value
    expect(list.length).toBe(1)
    // markRaw means Vue never wraps the wallet, so the getters use the real `this`
    expect(isReadonly(list[0])).toBe(false)
    expect(() => list[0].name).not.toThrow()
    expect(list[0].name).toBe('Slush')
    expect(list[0].icon).toContain('data:image')
  })

  it('signs a personal message via the wallet feature (for the NFT-gate challenge)', async () => {
    const { useWallet } = await import('@meddleware/wallet-adapter')
    const { connect, signPersonalMessage, wallets } = useWallet()
    await connect(wallets.value[0])
    const res = await signPersonalMessage(new TextEncoder().encode('nft-gate:access:abc'))
    expect(res.signature).toBe('PMSIG')
  })
})
