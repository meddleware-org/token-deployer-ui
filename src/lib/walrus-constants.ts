// Lightweight Walrus constants with NO heavy imports, so both the (lazily loaded)
// `lib/walrus.ts` client and the eagerly rendered `WalrusIconUpload.vue` component
// can share a single source of truth without pulling `@mysten/walrus` into the
// component's chunk.

/**
 * Storage duration (in Walrus epochs) reserved for an uploaded icon.
 *
 * Capped at Walrus's `max_epochs_ahead` (53 on testnet/mainnet — the maximum a
 * single `reserve_space` reservation accepts; a larger value aborts on-chain with
 * MoveAbort code 2). 53 epochs ≈ ~2 years at the ~2-week epoch cadence. Longer
 * retention requires periodically extending the blob before expiry (there is no
 * keeper — this is a manual/operator step).
 */
export const ICON_EPOCHS = 53
