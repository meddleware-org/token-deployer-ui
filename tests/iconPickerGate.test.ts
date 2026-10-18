import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The icon picker against a gated operator relay (walrus-relay 0.1.31): the pass price is read from the
// chain, the purchase button stays disabled until it is read, and no wallet prompt opens without it.

vi.mock('@meddleware/ui', () => ({
  UiNotice: { name: 'UiNotice', props: ['type'], template: '<div class="notice"><slot /></div>' },
  UiFieldHint: { name: 'UiFieldHint', props: ['fieldId'], template: '<span><slot /></span>' },
  UiSegmentedControl: { name: 'UiSegmentedControl', props: ['modelValue', 'options', 'ariaLabel'], template: '<div />' },
}))

const { account, readClient, buildDeployExecutor } = vi.hoisted(() => ({
  account: { value: null as { address: string } | null },
  readClient: {
    getObject: vi.fn(async () => {
      throw new Error('node unreachable')
    }),
    listOwnedObjects: vi.fn(async () => ({ objects: [], hasNextPage: false, cursor: null })),
  },
  buildDeployExecutor: vi.fn(),
}))
// Build-time values (`import.meta.env`) cannot be stubbed after load, so the gate and the operator relay
// are supplied through the same parsers the app uses.
vi.mock('../src/config.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config.js')>()
  return {
    ...real,
    ACCESS_GATE: { testnet: real.parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0x' + 'ab'.repeat(32) }), mainnet: null },
    WALRUS_RELAY_HOSTS: { testnet: 'https://relay.example.com', mainnet: real.PUBLIC_WALRUS_RELAY_HOSTS.mainnet },
  }
})
vi.mock('@meddleware/wallet-adapter', () => ({
  useWallet: () => ({ account, signPersonalMessage: vi.fn() }),
}))
vi.mock('../src/wallet.js', () => ({ getReadClient: () => readClient }))
vi.mock('../src/lib/deployExecutor.js', () => ({ buildDeployExecutor }))
vi.mock('../src/components/WalrusBlobBrowser.vue', () => ({ default: { name: 'WalrusBlobBrowser', template: '<div />' } }))
vi.mock('@meddleware/walrus-client/flow', () => ({
  browserStorage: vi.fn(),
  consumeStorageKey: vi.fn(),
  createGatedAccess: vi.fn(),
  getUploadRetry: vi.fn(),
  runBlobUpload: vi.fn(),
}))

describe('IconPicker with a gated operator relay', () => {
  beforeEach(() => {
    vi.resetModules()
    account.value = { address: '0x' + '1'.repeat(64) }
    // The operator relay's tip-config answers (any JSON), so it is the relay on offer.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ send_tip: { address: '0x' + '2'.repeat(64), kind: { const: 1000 } } }), { status: 200 })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    buildDeployExecutor.mockReset()
  })

  it('shows the purchase prompt, disabled while the price cannot be read, and never opens the wallet', async () => {
    const { default: IconPicker } = await import('../src/components/IconPicker.vue')
    const w = mount(IconPicker, { props: { modelValue: '', network: 'testnet', connected: true } })
    await flushPromises()
    // Pick a file so the upload panel shows the relay state.
    const input = w.find('input[type="file"]')
    const file = new File([new Uint8Array(10)], 'icon.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()

    const cta = w.find('.wru-cta')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('could not be read from the chain')
    const buy = cta.find('button')
    expect(buy.attributes('disabled')).toBeDefined()
    await buy.trigger('click')
    expect(buildDeployExecutor).not.toHaveBeenCalled()
    expect(w.text()).toContain('Read the price again')
  })
})
