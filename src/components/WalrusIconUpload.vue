<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useWallet } from '@meddleware/wallet-adapter'
import { buildDeployExecutor } from '../lib/deployExecutor.js'
import { useWalrusRelay } from '../composables/useWalrusRelay.js'
import { ICON_EPOCHS } from '../lib/walrus-constants.js'
import { ICON_MAX_BYTES, validateIconFile } from '../config.js'
import type { WalrusNetwork } from '../lib/walrus.js'
import type { Network } from '../lib/types.js'
import { UiNotice } from '@meddleware/ui'
// Vite serves the Walrus wasm as an asset URL (lightweight import — just the URL).
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url'

const props = defineProps<{ network: WalrusNetwork; connected: boolean }>()
const emit = defineEmits<{ (e: 'uploaded', url: string): void }>()

const { account } = useWallet()
const {
  selectedRelayHost,
  availableRelays,
  estimatedCost,
  fileSizeBytes,
  checkOperatorRelayHealth,
} = useWalrusRelay(props.network)

const uploading = ref(false)
const status = ref('')
const error = ref<string | null>(null)
const fileName = ref('')
let bytes: Uint8Array | null = null

const maxSizeLabel = `${Math.round(ICON_MAX_BYTES / 1024)} KB`
const ICON_YEARS = Math.round(ICON_EPOCHS / 26)

onMounted(() => {
  checkOperatorRelayHealth()
})

const showPublicRelayNotice = computed(() => availableRelays.value.length > 1)

const showFreeRelayTip = computed(() => {
  const publicHost = availableRelays.value.find((r) => r.isPublic)?.host
  return showPublicRelayNotice.value && selectedRelayHost.value !== publicHost
})

function onFile(e: Event): void {
  error.value = null
  bytes = null
  fileName.value = ''
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return

  // UX/cost guard only — the authoritative cap is the edge (relay) body limit.
  const invalid = validateIconFile(f)
  if (invalid) {
    error.value = invalid
    return
  }

  fileName.value = f.name
  fileSizeBytes.value = f.size
  const reader = new FileReader()
  reader.onload = () => {
    bytes = new Uint8Array(reader.result as ArrayBuffer)
  }
  reader.readAsArrayBuffer(f)
}

function onRelayChange(newHost: string): void {
  selectedRelayHost.value = newHost
}

async function upload(): Promise<void> {
  if (!bytes) {
    error.value = 'Choose an image first.'
    return
  }
  if (!account.value) {
    error.value = 'Connect your wallet first.'
    return
  }
  uploading.value = true
  error.value = null
  try {
    // Lazily load the heavy @mysten/walrus code and Sui client only on demand.
    const { createWalrusClient, createBlobUploadFlow, walrusBlobUrl } =
      await import('../lib/walrus.js')
    const { getReadClient } = await import('../lib/readClient.js')
    const executor = await buildDeployExecutor(props.network as Network)
    const suiClient = getReadClient(props.network as Network)
    const client = createWalrusClient(props.network, {
      wasmUrl: walrusWasmUrl,
      uploadRelayHost: selectedRelayHost.value,
    })
    const flow = createBlobUploadFlow(client, bytes)

    status.value = 'Encoding…'
    await flow.encode()

    // Disclose the relay fee before asking for a signature. `calculateUploadRelayTip`
    // takes the UNENCODED size and throws if the tip exceeds the client max guard.
    let feeNote = ''
    try {
      const tipMist = await client.walrus.calculateUploadRelayTip({ size: bytes.length })
      const tipSui = Number(tipMist) / 1e9
      feeNote = tipMist > 0n ? ` Relay fee ≈ ${tipSui.toFixed(4)} SUI + storage (WAL).` : ''
    } catch {
      // Non-fatal for disclosure; the register step surfaces any real tip error.
    }

    status.value = `Registering blob (approve in wallet)…${feeNote}`
    const regTx = flow.register({
      owner: account.value.address,
      epochs: ICON_EPOCHS,
      deletable: false,
    })
    // Set sender and build with the Sui client to resolve CoinWithBalance intents
    regTx.setSenderIfNotSet(account.value.address)
    await regTx.build({ client: suiClient })
    const reg = await executor.signAndExecute(regTx)
    await executor.waitForTransaction(reg.digest)

    status.value = 'Uploading to the relay…'
    await flow.upload({ digest: reg.digest })

    status.value = 'Certifying (approve in wallet)…'
    const certTx = flow.certify()
    // Set sender and build the certify transaction with the Sui client
    certTx.setSenderIfNotSet(account.value.address)
    await certTx.build({ client: suiClient })
    const cert = await executor.signAndExecute(certTx)
    await executor.waitForTransaction(cert.digest)

    const blob = await flow.getBlob()
    emit('uploaded', walrusBlobUrl(props.network, blob.blobId))
    status.value = 'Uploaded ✓ — URL filled in above.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    status.value = ''
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div>
    <label for="walrus-file" class="hint" style="display: block; font-weight: 600">
      …or upload an image to Walrus
    </label>
    <div class="row">
      <input
        id="walrus-file"
        type="file"
        accept="image/*"
        aria-label="Choose an image to upload to Walrus"
        aria-describedby="walrus-help"
        style="width: auto"
        @change="onFile"
      />
      <button type="button" :disabled="uploading || !connected || !fileName" @click="upload">
        <span v-if="uploading" class="spinner" aria-hidden="true"></span>
        Upload to Walrus
      </button>
    </div>

    <!-- Relay selection (shown only if multiple relays available) -->
    <fieldset v-if="fileName && availableRelays.length > 1" style="margin: 0.75rem 0">
      <legend>Upload relay</legend>
      <div style="display: flex; flex-direction: column; gap: 0.5rem">
        <label
          v-for="option in availableRelays"
          :key="option.host"
          style="display: flex; align-items: center; gap: 0.5rem"
        >
          <input
            type="radio"
            :value="option.host"
            :checked="selectedRelayHost === option.host"
            @change="(e) => onRelayChange((e.target as HTMLInputElement).value)"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </fieldset>

    <!-- Cost estimation (shown after file selection) -->
    <UiNotice v-if="fileName && estimatedCost" style="margin: 0.75rem 0">
      <strong>Estimated cost:</strong> {{ estimatedCost.label }}
    </UiNotice>

    <!-- Public relay notice -->
    <p v-if="showFreeRelayTip" class="hint" style="margin: 0.75rem 0">
      Tip: select the public relay above to avoid the relay fee.
    </p>

    <p id="walrus-help" class="hint" aria-live="polite">
      Max {{ maxSizeLabel }} · PNG/JPEG/WebP/SVG. Requires <strong>WAL</strong> (storage) and
      <strong>SUI</strong> (gas + a small relay fee) in your wallet; two wallet approvals. Blob
      stored for ~{{ ICON_YEARS }} years.
      <span v-if="status">{{ status }}</span>
    </p>
    <UiNotice v-if="error" type="error">{{ error }}</UiNotice>
  </div>
</template>
