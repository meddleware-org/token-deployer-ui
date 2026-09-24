// Thin wrapper around the shared `@meddleware/walrus-relay-ui` composable: injects
// this app's per-network relay host pair so the relay-selection + tip-estimation logic
// lives in exactly one place (DRY). The return shape is unchanged, so consumers
// (`WalrusIconUpload.vue`, `IconPicker.vue`) and tests are unaffected.
import { useWalrusRelay as useSharedWalrusRelay } from '@meddleware/walrus-relay'
import type { RelayAccessOptions, RelayOption } from '@meddleware/walrus-relay'
import { WALRUS_RELAY_HOSTS, PUBLIC_WALRUS_RELAY_HOSTS } from '../config.js'
import type { WalrusNetwork } from '../lib/walrus.js'

export type { RelayAccessOptions, RelayOption }

/**
 * Manage Walrus relay selection and cost estimation for `network`.
 * See `@meddleware/walrus-relay-ui`'s `useWalrusRelay` for the full behaviour.
 */
export function useWalrusRelay(network: WalrusNetwork, access: RelayAccessOptions = {}) {
  return useSharedWalrusRelay(
    { operator: WALRUS_RELAY_HOSTS[network], public: PUBLIC_WALRUS_RELAY_HOSTS[network] },
    access,
  )
}
