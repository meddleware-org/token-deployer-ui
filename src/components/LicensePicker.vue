<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchLicenseList, fetchLicenseText, NO_LICENSE } from '../lib/licenses.js'
import type { SpdxLicense } from '../lib/licenses.js'
import FormSelect from './FormSelect.vue'
import FieldHint from './FieldHint.vue'
import AppNotice from './AppNotice.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', id: string): void
  (e: 'name', name: string): void
}>()

const popular = ref<SpdxLicense[]>([])
const all = ref<SpdxLicense[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const allExceptNone = computed(() => all.value.filter((x) => x.id !== NO_LICENSE.id))
const currentLicenseName = computed(
  () => all.value.find((l) => l.id === props.modelValue)?.name ?? props.modelValue,
)

function emitSelection(id: string): void {
  emit('update:modelValue', id)
  const found =
    all.value.find((l) => l.id === id) ?? (id === NO_LICENSE.id ? NO_LICENSE : undefined)
  emit('name', found?.name ?? id)
}

const selectModel = computed({
  get: () => props.modelValue,
  set: (id: string) => emitSelection(id),
})

onMounted(async () => {
  try {
    const cat = await fetchLicenseList()
    popular.value = cat.popular
    all.value = cat.all
    emitSelection(props.modelValue)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

// License view modal
const licenseDialogEl = ref<HTMLDialogElement>()
const licenseText = ref<string | null>(null)
const licenseLoading = ref(false)
const licenseError = ref<string | null>(null)

async function openLicenseModal(): Promise<void> {
  licenseError.value = null
  if (props.modelValue !== NO_LICENSE.id) {
    licenseLoading.value = true
    try {
      licenseText.value = await fetchLicenseText(props.modelValue)
    } catch (e) {
      licenseError.value = e instanceof Error ? e.message : String(e)
    } finally {
      licenseLoading.value = false
    }
  }
  licenseDialogEl.value?.showModal()
}
</script>

<template>
  <div>
    <label for="license-select">
      License
      <FieldHint field-id="license-select">
        Applies only to the downloadable Move source package — embedded in the LICENSE file and
        source headers. Has <b>no effect on the on-chain token</b> or its transferability.
        Choose <b>CC0-1.0</b> (default) for public domain. Choose <b>None</b> to retain all rights.
      </FieldHint>
    </label>
    <div class="license-row">
      <FormSelect
        id="license-select"
        v-model="selectModel"
        :disabled="loading || Boolean(error)"
        aria-describedby="license-load-status"
      >
        <option :value="NO_LICENSE.id" :title="NO_LICENSE.name">{{ NO_LICENSE.id }}</option>
        <optgroup v-if="popular.length" label="Popular">
          <option
            v-for="l in popular"
            :key="'p-' + l.id"
            :value="l.id"
            :title="`${l.id} — ${l.name}`"
          >{{ l.id }}</option>
        </optgroup>
        <optgroup v-if="all.length" label="All licenses">
          <option
            v-for="l in allExceptNone"
            :key="l.id"
            :value="l.id"
            :title="`${l.id} — ${l.name}`"
          >{{ l.id }}</option>
        </optgroup>
      </FormSelect>
      <button type="button" class="view-btn" :disabled="loading" @click="openLicenseModal">
        View
      </button>
    </div>
    <p id="license-load-status" class="hint" aria-live="polite">
      <span v-if="loading"><span class="spinner" aria-hidden="true"></span> Loading licenses from SPDX…</span>
      <span v-else-if="error" class="field-error">Couldn't load the license list: {{ error }}</span>
    </p>
  </div>

  <dialog ref="licenseDialogEl" class="license-dialog" @click.self="licenseDialogEl?.close()">
    <div class="dialog-header">
      <h2>{{ currentLicenseName }}</h2>
      <button
        type="button"
        aria-label="Close"
        style="background: none; border: none; font-size: 1.5rem; padding: 0; cursor: pointer; color: var(--text)"
        @click="licenseDialogEl?.close()"
      >×</button>
    </div>
    <div v-if="licenseLoading" style="padding: 1rem 0">
      <span class="spinner" aria-hidden="true"></span> Loading…
    </div>
    <AppNotice v-else-if="licenseError" type="error">{{ licenseError }}</AppNotice>
    <template v-else-if="modelValue === NO_LICENSE.id">
      <p>No LICENSE file will be generated. All rights are reserved by the author.</p>
    </template>
    <template v-else>
      <p style="margin-top: 0">
        <a
          :href="`https://spdx.org/licenses/${modelValue}.html`"
          target="_blank"
          rel="noopener noreferrer"
        >View on SPDX ↗</a>
      </p>
      <pre class="license-text">{{ licenseText }}</pre>
    </template>
    <div style="margin-top: 1rem; text-align: right">
      <button type="button" @click="licenseDialogEl?.close()">Close</button>
    </div>
  </dialog>
</template>

<style scoped>
.license-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.license-row :deep(.select-wrapper) {
  flex: 1;
}

.view-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.license-dialog {
  width: min(680px, 92vw);
}

.license-text {
  white-space: pre-wrap;
  overflow-y: auto;
  max-height: 55vh;
  font-size: 0.8rem;
  font-family: monospace;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0;
}
</style>
