import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { configureWasm } from './lib/template.js'
import { useColorMode } from './composables/useColorMode.js'

// Apply the colour mode before mount so there is no theme flash. Defaults to
// `system` (follows the OS) while enabling the in-app light/dark/system control.
useColorMode('system')

// Vite serves the wasm as an asset URL; wasm-bindgen's init loads it on demand.
import wasmUrl from '@mysten/move-bytecode-template/web/move_bytecode_template_bg.wasm?url'

// Register the URL only; the 343 kB wasm is fetched lazily at first deploy so it
// doesn't block initial page load.
configureWasm(wasmUrl)

// E2E-only: register mock wallet and expose getSuiClient for headless tests.
// Wrapped in async IIFE to ensure wallet is registered BEFORE app mounts (timing critical).
// Tree-shaking removes this entire block from production when VITE_E2E !== '1'.
;(async () => {
  if (import.meta.env.VITE_E2E === '1') {
    const { getWallets } = await import('@mysten/wallet-standard')
    const { getReadClient: getSuiClient } = await import('./lib/readClient.js')

    // Mock fetch globally for RPC requests so Cypress intercepts are bypassed entirely
    const originalFetch = globalThis.fetch
    const publishDigest = '0x' + 'aa'.repeat(32)
    const packageId = '0x' + 'bb'.repeat(32)
    const treasureCapId = '0x' + 'cc'.repeat(32)
    const metadataCapId = '0x' + 'dd'.repeat(32)

    const mockRpcResponse = {
      digest: publishDigest,
      effects: {
        status: { status: 'success' },
        gasUsed: { computationCost: '1000', storageCost: '2000', storageRebate: '0' },
      },
      objectChanges: [
        { type: 'published', packageId },
        {
          type: 'created',
          objectType: `0x2::coin::TreasuryCap<${packageId}::mytoken::MYTOKEN>`,
          objectId: treasureCapId,
        },
        {
          type: 'created',
          objectType: `0x2::coin_registry::MetadataCap<${packageId}::mytoken::MYTOKEN>`,
          objectId: metadataCapId,
        },
      ],
      events: [],
      transaction: null,
      balanceChanges: null,
    }

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method || 'GET'
      const isRpcCall = (url.includes('fullnode') || url.includes('rpc')) && method === 'POST'

      if (isRpcCall) {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        const rpcMethod = body.method

        if (import.meta.env.VITE_E2E === '1') {
          console.log('[E2E Fetch Mock]', rpcMethod, 'URL:', url)
        }

        const result =
          rpcMethod === 'sui_executeTransactionBlock' || rpcMethod === 'sui_getTransactionBlock'
            ? mockRpcResponse
            : rpcMethod === 'suix_getCoins' || rpcMethod === 'suix_getBalance'
              ? { data: [], nextCursor: null, hasNextPage: false }
              : null

        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id || 1, result }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return originalFetch(input, init)
    }

    const E2E_ADDR = '0x' + 'a'.repeat(64)
    const E2E_PUB_KEY = new Uint8Array(32)

    const mockWallet = {
      name: 'Test Wallet',
      version: '1.0.0',
      icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      chains: ['sui:testnet', 'sui:mainnet'],
      accounts: [],
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: async () => ({
            accounts: [
              {
                address: E2E_ADDR,
                publicKey: E2E_PUB_KEY,
                chains: ['sui:testnet'],
                features: [],
                label: 'Test',
                icon: undefined,
              },
            ],
          }),
        },
        'standard:events': {
          version: '1.0.0',
          // The app subscribes to the global registry's register/unregister events,
          // not to per-wallet events, so a no-op listener returning a no-op
          // unsubscribe satisfies the wallet-standard required-feature filter.
          on: () => () => {},
        },
        'standard:disconnect': {
          version: '1.0.0',
          disconnect: async () => undefined,
        },
        'sui:signTransaction': {
          version: '2.0.0',
          signTransaction: async () => ({
            bytes: 'bW9jaw==',
            signature: 'bW9jaw==',
          }),
        },
      },
    }

    const api = getWallets()
    let unregister: (() => void) | undefined
    const w = window as unknown as Record<string, unknown>

    // Register mock wallet synchronously before app mounts so it's available immediately
    unregister = api.register(mockWallet as never)
    w.__e2eAddress = E2E_ADDR

    // Expose register/unregister for test control (e.g., disconnect test)
    w.__registerMockWallet = () => {
      if (!unregister) unregister = api.register(mockWallet as never)
    }
    w.__unregisterMockWallet = () => {
      unregister?.()
      unregister = undefined
    }

    // Expose getSuiClient for tests to build transactions
    w.__getSuiClient = getSuiClient
  }

  createApp(App).mount('#app')
})()
