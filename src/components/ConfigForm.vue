<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { FormModel } from '../lib/form.js'
import type { FormErrors } from '../lib/validation.js'
import { deriveStructName } from '../lib/validation.js'
import type { Network } from '../lib/types.js'
import LicensePicker from './LicensePicker.vue'
import IconPicker from './IconPicker.vue'
import { UiFormField, UiSelect, UiFieldHint } from '@meddleware/ui'

export type ConfigFormStep = 'identity' | 'token' | 'settings'

const props = defineProps<{
  form: FormModel
  errors: FormErrors
  canProceed: boolean
  network: Network
  connected: boolean
  formStep: ConfigFormStep
}>()
const emit = defineEmits<{ (e: 'next'): void; (e: 'back'): void }>()

const structPreview = computed(() => {
  const m = props.form.moduleName.trim()
  return m ? deriveStructName(m) : '—'
})
const coinTypePreview = computed(
  () => `<package>::${props.form.moduleName.trim() || 'module'}::${structPreview.value}`,
)
const identifierError = computed(() => visibleError('packageName') || visibleError('moduleName'))

const touched = reactive(new Set<string>())
function visibleError(key: string): string | undefined {
  return touched.has(key) ? props.errors[key as keyof FormErrors] : undefined
}

function onBlur(key: string): void {
  touched.add(key)
  const form = props.form as unknown as Record<string, unknown>
  if (typeof form[key] === 'string') form[key] = (form[key] as string).trim()
}
</script>

<template>
  <form novalidate @submit.prevent="emit('next')">

    <!-- Step 1: Identity -->
    <template v-if="formStep === 'identity'">
      <fieldset>
        <legend>Package identity <span class="permanent">(permanent)</span></legend>
        <div class="grid2">
          <UiFormField id="package" label="Package name" :error="visibleError('packageName')" v-slot="{ attrs }">
            <input v-bind="attrs" v-model="form.packageName" placeholder="my_token" autocomplete="off" @blur="onBlur('packageName')" />
          </UiFormField>
          <UiFormField id="module" label="Module name" :error="visibleError('moduleName')" v-slot="{ attrs }">
            <input v-bind="attrs" v-model="form.moduleName" placeholder="mytoken" autocomplete="off" @blur="onBlur('moduleName')" />
          </UiFormField>
        </div>
        <p class="hint" aria-live="polite">
          <template v-if="identifierError">
            Fix the package and module names to preview the coin type.
          </template>
          <template v-else>
            Coin type will be <span class="mono">{{ coinTypePreview }}</span
            >. The witness struct <span class="mono">{{ structPreview }}</span> is derived from
            the module name (a Sui requirement).
          </template>
        </p>
      </fieldset>
    </template>

    <!-- Step 2: Token -->
    <template v-if="formStep === 'token'">
      <fieldset>
        <legend>Token details</legend>

        <div class="grid2">
          <UiFormField id="name" label="Token name" :error="visibleError('name')" v-slot="{ attrs }">
            <input v-bind="attrs" v-model="form.name" autocomplete="off" @blur="onBlur('name')" />
          </UiFormField>
          <UiFormField id="symbol" label="Symbol" :error="visibleError('symbol')" v-slot="{ attrs }">
            <input v-bind="attrs" v-model="form.symbol" autocomplete="off" @blur="onBlur('symbol')" />
          </UiFormField>
        </div>

        <UiFormField id="description" label="Description" :error="visibleError('description')">
          <template #label-suffix>&nbsp;<span class="hint">(optional)</span></template>
          <template #default="{ attrs }">
            <textarea v-bind="attrs" v-model="form.description" @blur="onBlur('description')" />
          </template>
        </UiFormField>

        <UiFormField id="decimals" label="Decimals" :error="visibleError('decimals')">
          <template #label-suffix>&nbsp;<span class="permanent">(permanent)</span></template>
          <template #default="{ attrs }">
            <input v-bind="attrs" v-model="form.decimals" inputmode="numeric" @blur="onBlur('decimals')" />
          </template>
        </UiFormField>

        <IconPicker
          v-model="form.iconUrl"
          :network="network"
          :connected="connected"
          :error="visibleError('iconUrl')"
          @blur="onBlur('iconUrl')"
        />
      </fieldset>
    </template>

    <!-- Step 3: Settings -->
    <template v-if="formStep === 'settings'">
      <fieldset>
        <legend>Supply &amp; policies</legend>

        <UiFormField id="supply" label="Initial supply" :error="visibleError('initialSupply')">
          <template #label-suffix>
            <UiFieldHint field-id="supply">
              The number of whole tokens to mint and send to the recipient at deployment.
              Uses your chosen decimal precision — with 9 decimals, 1 token = 1,000,000,000 base units on-chain.
              Enter <b>0</b> or leave blank for no initial supply.
              You can mint more later if you choose the Mintable supply policy.
            </UiFieldHint>
          </template>
          <template #default="{ attrs }">
            <input v-bind="attrs" v-model="form.initialSupply" inputmode="numeric" placeholder="0" @blur="onBlur('initialSupply')" />
          </template>
        </UiFormField>

        <div class="grid2">
          <UiFormField id="supply-policy" label="Supply">
            <template #label-suffix>
              <UiFieldHint field-id="supply-policy">
                <b>Mintable</b>: you keep the TreasuryCap and can mint more tokens at any time.<br />
                <b>Fixed</b>: the TreasuryCap is frozen — the total supply is sealed at deployment.
              </UiFieldHint>
            </template>
            <template #default="{ attrs }">
              <UiSelect v-bind="attrs" v-model="form.supplyPolicy">
                <option value="mintable">Mintable</option>
                <option value="fixed">Fixed</option>
              </UiSelect>
            </template>
          </UiFormField>
          <UiFormField id="metadata-policy" label="Metadata">
            <template #label-suffix>
              <UiFieldHint field-id="metadata-policy">
                <b>Updatable</b>: you keep the MetadataCap and can later change the name, symbol,
                description, or icon.<br />
                <b>Frozen</b>: the MetadataCap is discarded — all metadata is permanently locked.
              </UiFieldHint>
            </template>
            <template #default="{ attrs }">
              <UiSelect v-bind="attrs" v-model="form.metadataPolicy">
                <option value="updatable">Updatable</option>
                <option value="frozen">Frozen</option>
              </UiSelect>
            </template>
          </UiFormField>
        </div>

        <UiFormField id="package-policy" label="Package code">
          <template #label-suffix>
            <UiFieldHint field-id="package-policy">
              <b>Immutable</b>: the UpgradeCap is burned — the on-chain code is sealed.
              Recommended for trust and auditability.<br />
              <b>Upgradeable</b>: you keep the UpgradeCap and can push code changes to the package
              after deployment.
            </UiFieldHint>
          </template>
          <template #default="{ attrs }">
            <UiSelect v-bind="attrs" v-model="form.packagePolicy">
              <option value="immutable">Immutable</option>
              <option value="upgradeable">Upgradeable</option>
            </UiSelect>
          </template>
        </UiFormField>

        <UiFormField id="recipient" label="Recipient" :error="visibleError('recipient')">
          <template #label-suffix>
            <UiFieldHint field-id="recipient">
              The Sui address that receives the TreasuryCap, MetadataCap, UpgradeCap (if kept),
              and any initial supply minted at deployment.
              Leave blank to send everything to the connected wallet.
              Enter a different address to separate the deployer wallet from the custody wallet.
            </UiFieldHint>
          </template>
          <template #default="{ attrs }">
            <input v-bind="attrs" v-model="form.recipient" placeholder="0x…" autocomplete="off" @blur="onBlur('recipient')" />
          </template>
        </UiFormField>

        <LicensePicker v-model="form.license" @name="form.licenseName = $event" />
      </fieldset>
    </template>

    <div class="row" style="margin-top: 1rem">
      <button v-if="formStep !== 'identity'" type="button" @click="emit('back')">Back</button>
      <button type="submit" class="primary" :disabled="!canProceed">
        {{ formStep === 'settings' ? 'Review &amp; deploy' : 'Next' }}
      </button>
    </div>
  </form>
</template>
