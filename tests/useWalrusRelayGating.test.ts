import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useWalrusRelay } from '../src/composables/useWalrusRelay.js'

// These tests cover the NFT-gate logic layered onto relay selection. The operator-relay
// visibility also depends on operator-relay env config (not set in unit tests), so we assert
// on `accessSatisfied`, which is a pure function of gate config + ownership.

describe('useWalrusRelay gating', () => {
  it('is unrestricted when no gate is configured (unchanged behaviour)', () => {
    const relay = useWalrusRelay('testnet')
    expect(relay.accessSatisfied.value).toBe(true)
    // The public relay is always present as a fallback.
    expect(relay.availableRelays.value.some((r) => r.isPublic)).toBe(true)
  })

  it('reflects ownership when a gate is configured', () => {
    const hasAccess = ref<boolean | null>(null)
    const relay = useWalrusRelay('testnet', { gateConfigured: true, hasAccess })
    expect(relay.accessSatisfied.value).toBe(false) // unknown ⇒ not satisfied

    hasAccess.value = true
    expect(relay.accessSatisfied.value).toBe(true)

    hasAccess.value = false
    expect(relay.accessSatisfied.value).toBe(false)
    // Public relay still available regardless of gate access.
    expect(relay.availableRelays.value.some((r) => r.isPublic)).toBe(true)
  })
})
