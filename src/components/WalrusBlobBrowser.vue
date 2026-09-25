<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWallet } from '@meddleware/wallet-adapter'
import { getReadClient } from '../lib/readClient.js'
import type { OwnedBlob, WalrusNetwork } from '../lib/walrus.js'
import type { Network } from '../lib/types.js'
import { UiNotice } from '@meddleware/ui'

const props = defineProps<{ network: WalrusNetwork; connected: boolean }>()
const emit = defineEmits<{ (e: 'select', url: string): void }>()

const { account } = useWallet()

const addressInput = ref(account.value?.address ?? '')
watch(
  () => account.value?.address,
  (addr) => {
    if (addr && !addressInput.value) addressInput.value = addr
  },
)

interface BlobItem extends OwnedBlob {
  url: string
}

const blobs = ref<BlobItem[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const selected = ref('')
const hasLoaded = ref(false)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function load(): Promise<void> {
  const addr = addressInput.value.trim() || account.value?.address
  if (!addr) {
    loadError.value = 'Enter an address or connect your wallet.'
    return
  }
  loading.value = true
  loadError.value = null
  blobs.value = []
  hasLoaded.value = false
  try {
    const { createWalrusClient, walrusBlobUrl, fetchOwnedWalrusBlobs } = await import(
      '../lib/walrus.js'
    )
    const suiClient = getReadClient(props.network as Network)
    const client = createWalrusClient(props.network)
    const raw = await fetchOwnedWalrusBlobs(suiClient, client, addr)
    blobs.value = raw.map((b) => ({ ...b, url: walrusBlobUrl(props.network, b.blobId) }))
    hasLoaded.value = true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function selectBlob(item: BlobItem): void {
  selected.value = item.blobId
  emit('select', item.url)
}
</script>

<template>
  <div class="blob-browser">
    <div class="row">
      <input
        v-model="addressInput"
        type="text"
        placeholder="0x… or leave blank for your wallet"
        aria-label="Wallet address to browse"
        style="flex: 1"
      />
      <button type="button" :disabled="loading || (!connected && !addressInput.trim())" @click="load">
        <span v-if="loading" class="spinner" aria-hidden="true"></span>
        Load
      </button>
    </div>
    <p class="hint">Browse Walrus blobs owned by this address. Only image blobs show a preview.</p>

    <UiNotice v-if="loadError" type="error">{{ loadError }}</UiNotice>

    <p v-if="hasLoaded && blobs.length === 0 && !loading" class="hint">
      No Walrus blobs found at this address.
    </p>

    <div v-if="blobs.length > 0" class="blob-grid" role="listbox" aria-label="Walrus blobs">
      <button
        v-for="b in blobs"
        :key="b.objectId"
        type="button"
        class="blob-thumb"
        :class="{ selected: selected === b.blobId }"
        role="option"
        :aria-selected="selected === b.blobId"
        @click="selectBlob(b)"
      >
        <img
          :src="b.url"
          :alt="`Blob ${b.blobId.slice(0, 8)}…`"
          loading="lazy"
          @error="(e) => (e.target as HTMLElement).parentElement?.classList.add('no-img')"
        />
        <span class="blob-meta">{{ formatSize(b.size) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.blob-browser {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.blob-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.blob-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}

.blob-thumb:hover {
  border-color: var(--accent);
}

.blob-thumb.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.blob-thumb img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}

.blob-thumb.no-img img {
  height: 0;
  width: 0;
  visibility: hidden;
}

.blob-thumb.no-img::before {
  content: '?';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  font-size: 1.25rem;
  color: var(--muted);
  background: var(--surface);
  border-radius: 3px;
}

.blob-meta {
  font-size: 0.65rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
