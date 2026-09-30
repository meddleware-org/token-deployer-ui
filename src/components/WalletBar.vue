<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWallet, useNetwork } from '@meddleware/wallet-adapter'
import { SELECTABLE_NETWORKS } from '../config.js'
import type { Network } from '../lib/types.js'

/** Wallet-supplied icons are untrusted: render only inline images or https URLs. */
function safeIcon(icon: string | undefined): string | undefined {
  if (!icon) return undefined
  if (/^data:image\/(png|svg\+xml|jpeg|webp|gif);/i.test(icon)) return icon
  try {
    return new URL(icon).protocol === 'https:' ? icon : undefined
  } catch {
    return undefined
  }
}
import { UiDialog, UiFormField, UiNotice, UiSelect } from '@meddleware/ui'

const { wallets, currentWallet, account, connecting, error, connect, disconnect } = useWallet()
const { network, setNetwork } = useNetwork()

const dialogOpen = ref(false)

const shortAddress = computed(() => {
  const a = account.value?.address
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
})

const networkModel = computed({
  get: () => network.value,
  set: (v: string) => setNetwork(v as Network),
})

// Close the connect dialog once a wallet connects.
watch(
  () => account.value,
  (acc) => {
    if (acc) dialogOpen.value = false
  },
)
</script>

<template>
  <section class="card wallet-bar" aria-label="Wallet and network">
    <template v-if="account">
      <label class="row wallet-bar__network">
        Network
        <UiSelect v-model="networkModel">
          <option v-for="n in SELECTABLE_NETWORKS" :key="n" :value="n">{{ n }}</option>
        </UiSelect>
      </label>
      <p class="row wallet-bar__account">
        <span class="badge">
          <span class="mw-visually-hidden">Connected wallet:</span>
          {{ currentWallet?.name }} · <span class="mono">{{ shortAddress }}</span>
        </span>
        <button type="button" @click="disconnect">Disconnect</button>
      </p>
    </template>
    <p v-else-if="!wallets.length" class="hint wallet-bar__none">
      No Sui wallet detected. Install a Sui wallet extension to continue.
    </p>
    <button v-else type="button" class="primary" @click="dialogOpen = true">Connect Wallet</button>

    <UiNotice v-if="error" type="error" class="wallet-bar__error">{{ error }}</UiNotice>
  </section>

  <UiDialog v-model:open="dialogOpen" title="Connect Wallet">
    <UiFormField id="dialog-network-select" label="Network">
      <template #default="{ attrs }">
        <UiSelect v-bind="attrs" v-model="networkModel">
          <option v-for="n in SELECTABLE_NETWORKS" :key="n" :value="n">{{ n }}</option>
        </UiSelect>
      </template>
    </UiFormField>

    <menu class="wallet-list">
      <li v-for="w in wallets" :key="w.name">
        <button type="button" class="primary" :disabled="connecting" @click="connect(w)">
          <img v-if="safeIcon(w.icon)" :src="safeIcon(w.icon)" alt="" width="20" height="20" />
          {{ w.name }}
        </button>
      </li>
    </menu>
  </UiDialog>
</template>

<style scoped>
.wallet-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.wallet-bar__network,
.wallet-bar__account,
.wallet-bar__none {
  margin: 0;
}
.wallet-bar__none {
  width: 100%;
}
.wallet-bar__error {
  flex-basis: 100%;
}
</style>
