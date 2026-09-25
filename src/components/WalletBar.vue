<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWallet, useNetwork } from '@meddleware/wallet-adapter'
import { SELECTABLE_NETWORKS } from '../config.js'
import type { Network } from '../lib/types.js'
import { UiSelect, UiNotice } from '@meddleware/ui'

const { wallets, currentWallet, account, connecting, error, connect, disconnect } = useWallet()
const { network, setNetwork } = useNetwork()

const dialogEl = ref<HTMLDialogElement>()

const shortAddress = computed(() => {
  const a = account.value?.address
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''
})

const networkModel = computed({
  get: () => network.value,
  set: (v: string) => setNetwork(v as Network),
})

function openDialog(): void {
  dialogEl.value?.showModal()
}

function closeDialog(): void {
  dialogEl.value?.close()
}

watch(() => account.value, (acc) => {
  if (acc) {
    closeDialog()
  }
})
</script>

<template>
  <div class="card" role="region" aria-label="Wallet and network">
    <template v-if="account">
      <div class="row" style="justify-content: space-between">
        <div class="row">
          <label for="network-select" style="margin: 0">Network</label>
          <UiSelect id="network-select" v-model="networkModel">
            <option v-for="n in SELECTABLE_NETWORKS" :key="n" :value="n">{{ n }}</option>
          </UiSelect>
        </div>

        <div class="row">
          <span class="badge" aria-label="Connected wallet">
            {{ currentWallet?.name }} · <span class="mono">{{ shortAddress }}</span>
          </span>
          <button type="button" @click="disconnect">Disconnect</button>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="row">
        <div v-if="!wallets.length" style="width: 100%">
          <p class="hint" style="margin: 0">
            No Sui wallet detected. Install a Sui wallet extension to continue.
          </p>
        </div>
        <button v-else type="button" class="primary" @click="openDialog">
          Connect Wallet
        </button>
      </div>
    </template>

    <UiNotice v-if="error" type="error" style="margin-top: 0.75rem">{{ error }}</UiNotice>
  </div>

  <dialog ref="dialogEl" aria-labelledby="wallet-dialog-title" @click.self="closeDialog">
    <div class="dialog-header">
      <h2 id="wallet-dialog-title">Connect Wallet</h2>
      <button
        type="button"
        aria-label="Close"
        style="background: none; border: none; font-size: 1.5rem; padding: 0; cursor: pointer; color: var(--text)"
        @click="closeDialog"
      >
        ×
      </button>
    </div>

    <div>
      <label for="dialog-network-select">Network</label>
      <UiSelect id="dialog-network-select" v-model="networkModel">
        <option v-for="n in SELECTABLE_NETWORKS" :key="n" :value="n">{{ n }}</option>
      </UiSelect>
    </div>

    <div class="wallet-list">
      <button
        v-for="w in wallets"
        :key="w.name"
        type="button"
        class="primary"
        :disabled="connecting"
        @click="connect(w)"
      >
        <img v-if="w.icon" :src="w.icon" alt="" width="20" height="20" />
        {{ w.name }}
      </button>
    </div>
  </dialog>
</template>
