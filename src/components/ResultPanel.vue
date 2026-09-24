<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PublishResult, TokenConfig } from '../lib/types.js'
import { explorerObjectUrl } from '../config.js'
import { generatePackageZip } from '../lib/generatePackage.js'
import { fetchLicenseText } from '../lib/licenses.js'
import GithubPush from './GithubPush.vue'
import AppNotice from './AppNotice.vue'

const props = defineProps<{ result: PublishResult; config: TokenConfig }>()
defineEmits<{ (e: 'restart'): void }>()

const downloading = ref(false)
const downloadError = ref<string | null>(null)

const packageUrl = computed(() => explorerObjectUrl(props.result.network, props.result.packageId))

async function downloadPackage(): Promise<void> {
  downloading.value = true
  downloadError.value = null
  try {
    const licenseText = await fetchLicenseText(props.config.license)
    const zip = generatePackageZip({
      config: props.config,
      licenseText: licenseText ?? undefined,
      result: props.result,
    })
    const blob = new Blob([zip as BlobPart], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.config.packageName}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    downloadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="result-h">
    <h2 id="result-h">🎉 {{ config.symbol }} is live on {{ result.network }}</h2>

    <dl>
      <dt>Coin type</dt>
      <dd class="mono">{{ result.coinType }}</dd>
      <dt>Package</dt>
      <dd class="mono">
        <a :href="packageUrl" target="_blank" rel="noopener noreferrer">
          {{ result.packageId }}
        </a>
      </dd>
      <dt v-if="result.treasuryCapId">TreasuryCap</dt>
      <dd v-if="result.treasuryCapId" class="mono">{{ result.treasuryCapId }}</dd>
      <dt v-if="result.metadataCapId">MetadataCap</dt>
      <dd v-if="result.metadataCapId" class="mono">{{ result.metadataCapId }}</dd>
      <dt>Package code</dt>
      <dd>{{ result.upgradeCapId ? 'Upgradeable' : 'Immutable (UpgradeCap burned)' }}</dd>
    </dl>

    <div class="row">
      <button type="button" class="primary" :disabled="downloading" @click="downloadPackage">
        <span v-if="downloading" class="spinner" aria-hidden="true"></span>
        Download source package (.zip)
      </button>
      <button type="button" @click="$emit('restart')">Deploy another</button>
    </div>
    <AppNotice v-if="downloadError" type="error">{{ downloadError }}</AppNotice>

    <div style="margin-top: 1rem">
      <GithubPush :config="config" :result="result" />
    </div>

    <p v-once class="hint" style="margin-top: 1rem">
      The download is the full, buildable Move package (matching this on-chain deployment) — your
      TreasuryCap grants minting rights; keep it safe. This tool takes no custody of your token.
    </p>
    <p v-once class="hint">
      You are the sole author of this token. This tool does not review or endorse it, and its
      appearance here is not a mark of legitimacy.
    </p>
  </section>
</template>
