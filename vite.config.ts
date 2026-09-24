import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

const ZERO_ADDR = '0x' + '0'.repeat(64)

// Networks a production build must have a real (non-zero) treasury for. Mirrors
// SELECTABLE_NETWORKS in src/config.ts — kept as a literal here to avoid importing
// app code into the build config.
const REQUIRED_TREASURY_NETWORKS = ['TESTNET', 'MAINNET'] as const

/**
 * Fail a production build when a selectable network's fee treasury is still the
 * zero address, so revenue can never silently burn to 0x0. Bypass for dev/e2e
 * builds with VITE_ALLOW_UNSET_TREASURY=1 (or VITE_E2E=1).
 */
function assertTreasuryConfigured(env: Record<string, string>): void {
  if (env.VITE_ALLOW_UNSET_TREASURY === '1' || env.VITE_E2E === '1') return
  const unset = REQUIRED_TREASURY_NETWORKS.filter((n) => {
    const v = env[`VITE_FEE_TREASURY_${n}`]
    return !v || v === ZERO_ADDR
  })
  if (unset.length > 0) {
    throw new Error(
      `Refusing to build: fee treasury unset (zero address) for ${unset.join(', ')}. ` +
        `Set VITE_FEE_TREASURY_${unset[0]} (see .env.production/.env.example), ` +
        `or set VITE_ALLOW_UNSET_TREASURY=1 for a dev/e2e build.`,
    )
  }
}

// The move-bytecode-template package ships a .wasm that must be served as an
// asset; `wasm` is excluded from dep-optimization so its URL import resolves.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && mode === 'production') assertTreasuryConfigured(env)

  return {
    base: "/",
    plugins: [vue()],
    optimizeDeps: {
      exclude: ['@mysten/move-bytecode-template'],
    },
    build: {
      target: 'esnext',
      rollupOptions: {
        output: {
          // Pin the Sui SDK into its own long-lived vendor chunk so app changes
          // don't bust its cache. Matched by module id (not package entry, which
          // @mysten/sui does not expose). @mysten/walrus + move-bytecode-template
          // are explicitly left out so they stay in their lazy dynamic chunks.
          manualChunks(id: string) {
            if (id.includes('@mysten/walrus') || id.includes('move-bytecode-template')) return
            if (
              id.includes('@mysten/sui') ||
              id.includes('@mysten/bcs') ||
              id.includes('@mysten/wallet-standard')
            ) {
              return 'vendor-sui'
            }
          },
        },
      },
    },
  }
})
