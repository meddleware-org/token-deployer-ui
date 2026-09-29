import '@meddleware/design-tokens/tokens.css'
import '@meddleware/design-tokens/seasons.css'
import '@meddleware/ui/base.css'
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import './component-styles.css'
import { configureWasm } from './lib/template.js'
// Static: readClient is already in the main chunk (IconPicker, WalrusBlobBrowser and listMyTokens
// import it), so a dynamic import in the E2E block below could not split it out anyway.
import { getReadClient, setReadClient } from './lib/readClient.js'
import type { SuiGrpcClient } from '@mysten/sui/grpc'
import { useColorMode, useSeason } from '@meddleware/ui'

// Apply the colour mode before mount so there is no theme flash. Defaults to
// `system` (follows the OS) while enabling the in-app light/dark/system control.
useColorMode('system')

// Enable seasonal theming (sets data-season on <html>; seasons.css is imported above).
useSeason()

// Vite serves the wasm as an asset URL; wasm-bindgen's init loads it on demand.
import wasmUrl from '@mysten/move-bytecode-template/web/move_bytecode_template_bg.wasm?url'

// Register the URL only; the 343 kB wasm is fetched lazily at first deploy so it
// doesn't block initial page load.
configureWasm(wasmUrl)

// E2E-only: stub the Sui client, register a mock wallet and expose getSuiClient for headless tests.
// Wrapped in async IIFE to ensure wallet is registered BEFORE app mounts (timing critical).
// Only the `e2e` build mode may set VITE_E2E (vite.config.ts refuses otherwise); both are static,
// so every other build tree-shakes this entire block (verified by `npm run check:bundle`).
;(async () => {
  if (import.meta.env.MODE === 'e2e' && import.meta.env.VITE_E2E === '1') {
    const { getWallets } = await import('@mysten/wallet-standard')

    // Stub gRPC client in place of the network (gRPC-web is binary, so it cannot be faked
    // at the fetch layer). Returns a successful publish whose effects carry the created
    // TreasuryCap/MetadataCap, and empty owned-object lists.
    const publishDigest = 'E2E' + 'a'.repeat(41)
    const packageId = '0x' + 'bb'.repeat(32)
    const treasuryCapId = '0x' + 'cc'.repeat(32)
    const metadataCapId = '0x' + 'dd'.repeat(32)
    const created = (objectId: string) => ({
      objectId,
      outputState: 'ObjectWrite',
      idOperation: 'Created',
      outputVersion: '1',
      outputDigest: publishDigest,
    })
    const executed = {
      $kind: 'Transaction',
      Transaction: {
        digest: publishDigest,
        status: { success: true, error: null },
        effects: {
          changedObjects: [
            { objectId: packageId, outputState: 'PackageWrite', idOperation: 'Created' },
            created(treasuryCapId),
            created(metadataCapId),
          ],
        },
        objectTypes: {
          [treasuryCapId]: `0x2::coin::TreasuryCap<${packageId}::mytoken::MYTOKEN>`,
          [metadataCapId]: `0x2::coin_registry::MetadataCap<${packageId}::mytoken::MYTOKEN>`,
        },
      },
    }
    const noObjects = async () => ({ objects: [], hasNextPage: false, cursor: null })
    const stubClient = {
      executeTransaction: async () => executed,
      waitForTransaction: async () => executed,
      listOwnedObjects: noObjects,
      core: { listOwnedObjects: noObjects },
    } as unknown as SuiGrpcClient
    setReadClient('testnet', stubClient)
    setReadClient('mainnet', stubClient)

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
    w.__getSuiClient = getReadClient
  }

  createApp(App).mount('#app')
})()
