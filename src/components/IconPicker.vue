<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useWallet } from '@meddleware/wallet-adapter'
import { buildDeployExecutor } from '../lib/deployExecutor.js'
import { getReadClient } from '../lib/readClient.js'
import { useWalrusRelay } from '../composables/useWalrusRelay.js'
import { useAccessGate } from '../composables/useAccessGate.js'
import { ICON_EPOCHS } from '../lib/walrus-constants.js'
import { ICON_MAX_BYTES, validateIconFile } from '../config.js'
import {
  fetchRelayChallenge,
  personalMessageForNonce,
  buildAccessProofToken,
} from '../lib/accessGate.js'
import type { WalrusNetwork } from '../lib/walrus.js'
import type { Network } from '../lib/types.js'
import { UiNotice, UiFieldHint, UiSegmentedControl } from '@meddleware/ui'
import WalrusBlobBrowser from './WalrusBlobBrowser.vue'
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url'

const props = defineProps<{
  modelValue: string
  network: Network
  connected: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', url: string): void
  (e: 'blur'): void
}>()

const { account, signPersonalMessage } = useWallet()

const isWalrusNetwork = computed(() => props.network !== 'localnet')
const walrusNet: WalrusNetwork = props.network === 'mainnet' ? 'mainnet' : 'testnet'

// NFT-gated relay access (inert when no gate is configured for this network).
const accessGate = useAccessGate(walrusNet, { getClient: (n) => getReadClient(n) })

const {
  selectedRelayHost,
  availableRelays,
  purchaseAccessAvailable,
  estimatedCost,
  fileSizeBytes,
  checkOperatorRelayHealth,
} = useWalrusRelay(walrusNet, {
  gateConfigured: accessGate.gateConfigured,
  hasAccess: accessGate.hasAccess,
})

const purchasing = ref(false)

async function refreshAccess(): Promise<void> {
  if (isWalrusNetwork.value && accessGate.gateConfigured && account.value) {
    await accessGate.checkOwnership(account.value.address)
  }
}

/** Buy relay access (mints the gate NFT to the wallet), then re-check ownership. */
async function purchaseAccess(): Promise<void> {
  if (!account.value) {
    uploadError.value = 'Connect your wallet first.'
    return
  }
  purchasing.value = true
  uploadError.value = null
  try {
    const executor = await buildDeployExecutor(props.network as Network)
    await accessGate.purchase(executor, account.value.address)
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    purchasing.value = false
  }
}

const tab = ref('url')

// Upload state
const uploading = ref(false)
const status = ref('')
const uploadError = ref<string | null>(null)
const fileName = ref('')
let bytes: Uint8Array | null = null

const permanent = ref(true)
const maxSizeLabel = `${Math.round(ICON_MAX_BYTES / 1024)} KB`
const ICON_YEARS = Math.round(ICON_EPOCHS / 26)

const showFreeRelayTip = computed(() => {
  const publicHost = availableRelays.value.find((r) => r.isPublic)?.host
  return availableRelays.value.length > 1 && selectedRelayHost.value !== publicHost
})

onMounted(() => {
  if (isWalrusNetwork.value) {
    checkOperatorRelayHealth()
    void refreshAccess()
  }
})

// Re-check NFT ownership whenever the connected account changes.
watch(
  () => account.value?.address,
  () => {
    void refreshAccess()
  },
)

function onFile(e: Event): void {
  uploadError.value = null
  bytes = null
  fileName.value = ''
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const invalid = validateIconFile(f)
  if (invalid) { uploadError.value = invalid; return }
  fileName.value = f.name
  fileSizeBytes.value = f.size
  const reader = new FileReader()
  reader.onload = () => { bytes = new Uint8Array(reader.result as ArrayBuffer) }
  reader.readAsArrayBuffer(f)
}

function onRelayChange(newHost: string): void {
  selectedRelayHost.value = newHost
}

async function upload(): Promise<void> {
  if (!bytes) { uploadError.value = 'Choose an image first.'; return }
  if (!account.value) { uploadError.value = 'Connect your wallet first.'; return }
  uploading.value = true
  uploadError.value = null
  try {
    const { createWalrusClient, createBlobUploadFlow, walrusBlobUrl } = await import(
      '../lib/walrus.js'
    )
    const executor = await buildDeployExecutor(props.network as Network)
    const suiClient = getReadClient(props.network as Network)

    // If the gated operator relay is selected, prove NFT access: (single-use only) consume
    // one use on-chain bound to the challenge nonce, then sign the challenge. The token rides
    // the relay Authorization header; the nft-gate gateway verifies it before proxying.
    let uploadRelayAuthToken: string | undefined
    const publicHost = availableRelays.value.find((r) => r.isPublic)?.host
    const usingOperatorRelay = selectedRelayHost.value !== publicHost
    if (accessGate.gateConfigured && usingOperatorRelay && account.value) {
      const challenge = await fetchRelayChallenge(selectedRelayHost.value)
      let consumeDigest: string | undefined
      if (accessGate.usesRemaining.value != null && accessGate.nftId.value) {
        status.value = 'Consuming one access use (approve in wallet)…'
        const consumeTx = accessGate.buildConsume(accessGate.nftId.value, challenge.nonce)
        const cres = await executor.signAndExecute(consumeTx)
        await executor.waitForTransaction(cres.digest)
        consumeDigest = cres.digest
      }
      status.value = 'Signing relay access proof…'
      const { signature } = await signPersonalMessage(personalMessageForNonce(challenge.nonce))
      uploadRelayAuthToken = buildAccessProofToken({
        address: account.value.address,
        nonce: challenge.nonce,
        signature,
        consumeDigest,
      })
    }

    const client = createWalrusClient(walrusNet, {
      wasmUrl: walrusWasmUrl,
      uploadRelayHost: selectedRelayHost.value,
      uploadRelayAuthToken,
    })
    const flow = createBlobUploadFlow(client, bytes)

    status.value = 'Encoding…'
    await flow.encode()

    let feeNote = ''
    try {
      const tipMist = await client.walrus.calculateUploadRelayTip({ size: bytes.length })
      const tipSui = Number(tipMist) / 1e9
      feeNote = tipMist > 0n ? ` Relay fee ≈ ${tipSui.toFixed(4)} SUI + storage (WAL).` : ''
    } catch {
      // Non-fatal — the register step surfaces any real tip error.
    }

    status.value = `Registering blob (approve in wallet)…${feeNote}`
    const regTx = flow.register({
      owner: account.value.address,
      epochs: ICON_EPOCHS,
      deletable: !permanent.value,
    })
    regTx.setSenderIfNotSet(account.value.address)
    await regTx.build({ client: suiClient })
    const reg = await executor.signAndExecute(regTx)
    await executor.waitForTransaction(reg.digest)

    status.value = 'Uploading to the relay…'
    await flow.upload({ digest: reg.digest })

    status.value = 'Certifying (approve in wallet)…'
    const certTx = flow.certify()
    certTx.setSenderIfNotSet(account.value.address)
    await certTx.build({ client: suiClient })
    const cert = await executor.signAndExecute(certTx)
    await executor.waitForTransaction(cert.digest)

    const blob = await flow.getBlob()
    emit('update:modelValue', walrusBlobUrl(walrusNet, blob.blobId))
    tab.value = 'url'
    status.value = 'Uploaded ✓ — URL filled in above.'
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : String(e)
    status.value = ''
  } finally {
    uploading.value = false
  }
}

function onBrowseSelect(url: string): void {
  emit('update:modelValue', url)
  tab.value = 'url'
}
</script>

<template>
  <fieldset class="icon-picker">
    <legend>Icon <span class="hint">(optional)</span></legend>

    <UiSegmentedControl
      v-model="tab"
      :options="[
        { id: 'url', label: 'URL' },
        { id: 'upload', label: 'Upload to Walrus', disabled: !isWalrusNetwork, title: isWalrusNetwork ? undefined : 'Not available on localnet' },
        { id: 'browse', label: 'My Walrus blobs', disabled: !isWalrusNetwork, title: isWalrusNetwork ? undefined : 'Not available on localnet' },
      ]"
      aria-label="Icon source"
      style="margin-bottom: 0.75rem"
    />

    <!-- URL panel -->
    <div v-show="tab === 'url'" class="icon-panel">
      <input
        id="icon"
        type="url"
        :value="modelValue"
        placeholder="https://…"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? 'icon-error' : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur')"
      />
      <p v-if="error" id="icon-error" class="field-error">{{ error }}</p>
    </div>

    <!-- Upload panel -->
    <div v-show="tab === 'upload' && isWalrusNetwork" class="icon-panel">
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

      <label class="permanent-toggle">
        <input type="checkbox" v-model="permanent" />
        Permanent blob <span class="hint">(cannot be deleted)</span>
        <UiFieldHint field-id="blob-permanent">
          A permanent blob cannot be deleted once registered, even within its storage period.
          Deletable blobs can be removed early by the owner to reclaim unused storage fees (WAL).
          Permanent is the safer default for a token icon that should remain available indefinitely.
        </UiFieldHint>
      </label>

      <fieldset v-if="fileName && availableRelays.length > 1" style="margin: 0.5rem 0">
        <legend>
          Upload relay
          <UiFieldHint field-id="upload-relay">
            Browsers can't write to Walrus directly, so the blob is sent through an upload relay.
            The <b>public</b> relay is free; the <b>operator</b> relay is run by this app and may
            charge a small SUI tip per upload. Both store the identical blob — pick whichever you
            prefer.
          </UiFieldHint>
        </legend>
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

      <UiNotice v-if="fileName && estimatedCost" style="margin: 0.5rem 0">
        <strong>Estimated cost:</strong> {{ estimatedCost.label }}
      </UiNotice>

      <!-- NFT-gated relay: the operator relay is live but this wallet lacks the access NFT.
           The public relay is still available; purchasing unlocks the operator relay. -->
      <UiNotice v-if="fileName && purchaseAccessAvailable" style="margin: 0.5rem 0">
        <p style="margin: 0 0 0.5rem">
          The operator relay requires an access NFT. You can keep using the public relay, or
          purchase access to support this app’s relay.
        </p>
        <button type="button" :disabled="purchasing || !connected" @click="purchaseAccess">
          {{ purchasing ? 'Purchasing…' : 'Purchase relay access' }}
        </button>
      </UiNotice>

      <p v-if="showFreeRelayTip" class="hint" style="margin: 0.5rem 0">
        Tip: select the public relay above to avoid the relay fee.
      </p>

      <p id="walrus-help" class="upload-note" aria-live="polite">
        Max {{ maxSizeLabel }} · PNG/JPEG/WebP/SVG. Requires <strong>WAL</strong> (storage) and
        <strong>SUI</strong> (gas + relay fee) in your wallet; two approvals. Stored for
        ~{{ ICON_YEARS }} years. <span v-if="status">{{ status }}</span>
      </p>
      <UiNotice v-if="uploadError" type="error">{{ uploadError }}</UiNotice>
    </div>

    <!-- Browse panel -->
    <div v-show="tab === 'browse' && isWalrusNetwork" class="icon-panel">
      <WalrusBlobBrowser :network="walrusNet" :connected="connected" @select="onBrowseSelect" />
    </div>
  </fieldset>
</template>

<style scoped>
.icon-panel {
  padding-top: 0.5rem;
}

.permanent-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  /* Only span the content — otherwise the row stretches the full field width. */
  width: fit-content;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.permanent-toggle input[type='checkbox'] {
  /* Override the global `input { width: 100% }` so the checkbox stays its
     natural size instead of consuming most of the row. */
  width: auto;
  flex: none;
  margin: 0;
}

/* Boxed, muted note that reads as section-level guidance — visually distinct
   from the Permanent-blob toggle above it. */
.upload-note {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.45;
}
</style>
