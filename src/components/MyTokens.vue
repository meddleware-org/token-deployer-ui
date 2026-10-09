<script setup lang="ts">
// Lists the coins the connected wallet deployed or controls (an owned TreasuryCap<T> or MetadataCap<T>, or a
// held coin whose package the wallet published — a fixed supply with frozen metadata has no capability). Read-only,
// mirroring access-gate's "My Gates". Loads on mount and whenever the address or network changes.
import { computed, ref, watch } from 'vue'
import {
  CopyableAddress,
  ExplorerLink,
  UiNotice,
  suiExplorerUrl,
  type SuiNetwork,
} from '@meddleware/ui'
import { listMyTokens, type DeployedToken } from '@meddleware/sui-token-client'
import { getReadClient } from '../wallet.js'
import type { TokenNetwork as Network } from '@meddleware/sui-token-client'

const props = defineProps<{ owner: string | null; network: Network }>()

// SuiVision has no localnet explorer, so only build object links on public networks.
const explorerNetwork = computed<SuiNetwork | null>(() =>
  props.network === 'localnet' ? null : props.network,
)

const tokens = ref<DeployedToken[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Each load gets a number; a result that arrives after a newer load started (an account or network
// switch mid-request) is dropped, so one account's or network's tokens never show under another.
let latest = 0

async function load(): Promise<void> {
  const run = ++latest
  if (!props.owner) {
    tokens.value = []
    error.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const found = await listMyTokens(getReadClient(props.network), props.owner)
    if (run === latest) tokens.value = found
  } catch (e) {
    if (run !== latest) return
    error.value = e instanceof Error ? e.message : String(e)
    tokens.value = []
  } finally {
    if (run === latest) loading.value = false
  }
}

watch(() => [props.owner, props.network] as const, load, { immediate: true })
defineExpose({ reload: load })
</script>

<template>
  <div class="my-tokens">
    <p v-if="loading" class="hint">Loading your deployed tokens…</p>
    <UiNotice v-else-if="error" type="error">{{ error }}</UiNotice>
    <p v-else-if="!tokens.length" class="hint">
      No deployed tokens found for this wallet. Deploy one from the <strong>Deploy</strong> tab.
    </p>
    <ul v-else class="my-tokens__list">
      <li v-for="t in tokens" :key="t.coinType" class="my-tokens__item">
        <div class="my-tokens__label">{{ t.label }}</div>
        <dl class="my-tokens__meta">
          <dt>Coin type</dt>
          <dd><CopyableAddress :address="t.coinType" label="Copy coin type" /></dd>
          <dt>Package</dt>
          <dd>
            <CopyableAddress :address="t.packageId" label="Copy package id">
              <ExplorerLink
                v-if="explorerNetwork"
                :href="suiExplorerUrl('object', t.packageId, explorerNetwork)"
                :value="t.packageId"
              />
            </CopyableAddress>
          </dd>
          <dt>Treasury cap</dt>
          <dd v-if="t.treasuryCapId">
            <CopyableAddress :address="t.treasuryCapId" label="Copy treasury cap id">
              <ExplorerLink
                v-if="explorerNetwork"
                :href="suiExplorerUrl('object', t.treasuryCapId, explorerNetwork)"
                :value="t.treasuryCapId"
              />
            </CopyableAddress>
          </dd>
          <dd v-else>None — the supply is fixed, or the cap is held elsewhere</dd>
          <dt>Metadata cap</dt>
          <dd v-if="t.metadataCapId">
            <CopyableAddress :address="t.metadataCapId" label="Copy metadata cap id">
              <ExplorerLink
                v-if="explorerNetwork"
                :href="suiExplorerUrl('object', t.metadataCapId, explorerNetwork)"
                :value="t.metadataCapId"
              />
            </CopyableAddress>
          </dd>
          <dd v-else>None — the metadata is frozen, or the cap is held elsewhere</dd>
        </dl>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.my-tokens__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.my-tokens__item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 0.9rem;
  background: var(--surface);
}
.my-tokens__label {
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.my-tokens__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
}
.my-tokens__meta dt {
  color: var(--muted);
  white-space: nowrap;
}
.my-tokens__meta dd {
  margin: 0;
  min-width: 0;
  font-family: var(--mw-font-mono);
  font-size: 0.72rem;
}
</style>
