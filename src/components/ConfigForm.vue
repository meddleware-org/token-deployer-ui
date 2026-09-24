<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { FormModel } from '../lib/form.js'
import type { FormErrors } from '../lib/validation.js'
import { deriveStructName } from '../lib/validation.js'
import type { Network } from '../lib/types.js'
import LicensePicker from './LicensePicker.vue'
import IconPicker from './IconPicker.vue'
import FormField from './FormField.vue'
import FormSelect from './FormSelect.vue'
import FieldHint from './FieldHint.vue'

const props = defineProps<{
  form: FormModel
  errors: FormErrors
  canProceed: boolean
  network: Network
  connected: boolean
}>()
const emit = defineEmits<{ (e: 'submit'): void }>()

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
  <form novalidate @submit.prevent="emit('submit')">
    <fieldset>
      <legend>Package identity <span class="permanent">(permanent)</span></legend>
      <div class="grid2">
        <FormField id="package" label="Package name" :error="visibleError('packageName')" v-slot="{ attrs }">
          <input v-bind="attrs" v-model="form.packageName" placeholder="my_token" autocomplete="off" @blur="onBlur('packageName')" />
        </FormField>
        <FormField id="module" label="Module name" :error="visibleError('moduleName')" v-slot="{ attrs }">
          <input v-bind="attrs" v-model="form.moduleName" placeholder="mytoken" autocomplete="off" @blur="onBlur('moduleName')" />
        </FormField>
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

    <fieldset>
      <legend>Token details</legend>

      <div class="grid2">
        <FormField id="name" label="Token name" :error="visibleError('name')" v-slot="{ attrs }">
          <input v-bind="attrs" v-model="form.name" autocomplete="off" @blur="onBlur('name')" />
        </FormField>
        <FormField id="symbol" label="Symbol" :error="visibleError('symbol')" v-slot="{ attrs }">
          <input v-bind="attrs" v-model="form.symbol" autocomplete="off" @blur="onBlur('symbol')" />
        </FormField>
      </div>

      <FormField id="description" label="Description" :error="visibleError('description')">
        <template #label-suffix>&nbsp;<span class="hint">(optional)</span></template>
        <template #default="{ attrs }">
          <textarea v-bind="attrs" v-model="form.description" @blur="onBlur('description')" />
        </template>
      </FormField>

      <FormField id="decimals" label="Decimals" :error="visibleError('decimals')">
        <template #label-suffix>&nbsp;<span class="permanent">(permanent)</span></template>
        <template #default="{ attrs }">
          <input v-bind="attrs" v-model="form.decimals" inputmode="numeric" @blur="onBlur('decimals')" />
        </template>
      </FormField>

      <IconPicker
        v-model="form.iconUrl"
        :network="network"
        :connected="connected"
        :error="visibleError('iconUrl')"
        @blur="onBlur('iconUrl')"
      />
    </fieldset>

    <details>
      <summary>Advanced options</summary>
      <fieldset>
        <legend class="visually-hidden">Advanced options</legend>

        <FormField id="supply" label="Initial supply" :error="visibleError('initialSupply')">
          <template #label-suffix>
            <FieldHint field-id="supply">
              The number of whole tokens to mint and send to the recipient at deployment.
              Uses your chosen decimal precision — with 9 decimals, 1 token = 1,000,000,000 base units on-chain.
              Enter <b>0</b> or leave blank for no initial supply.
              You can mint more later if you choose the Mintable supply policy.
            </FieldHint>
          </template>
          <template #default="{ attrs }">
            <input v-bind="attrs" v-model="form.initialSupply" inputmode="numeric" placeholder="0" @blur="onBlur('initialSupply')" />
          </template>
        </FormField>

        <div class="grid2">
          <FormField id="supply-policy" label="Supply">
            <template #label-suffix>
              <FieldHint field-id="supply-policy">
                <b>Mintable</b>: you keep the TreasuryCap and can mint more tokens at any time.<br />
                <b>Fixed</b>: the TreasuryCap is frozen — the total supply is sealed at deployment.
              </FieldHint>
            </template>
            <template #default="{ attrs }">
              <FormSelect v-bind="attrs" v-model="form.supplyPolicy">
                <option value="mintable">Mintable</option>
                <option value="fixed">Fixed</option>
              </FormSelect>
            </template>
          </FormField>
          <FormField id="metadata-policy" label="Metadata">
            <template #label-suffix>
              <FieldHint field-id="metadata-policy">
                <b>Updatable</b>: you keep the MetadataCap and can later change the name, symbol,
                description, or icon.<br />
                <b>Frozen</b>: the MetadataCap is discarded — all metadata is permanently locked.
              </FieldHint>
            </template>
            <template #default="{ attrs }">
              <FormSelect v-bind="attrs" v-model="form.metadataPolicy">
                <option value="updatable">Updatable</option>
                <option value="frozen">Frozen</option>
              </FormSelect>
            </template>
          </FormField>
        </div>

        <FormField id="package-policy" label="Package code">
          <template #label-suffix>
            <FieldHint field-id="package-policy">
              <b>Immutable</b>: the UpgradeCap is burned — the on-chain code is sealed.
              Recommended for trust and auditability.<br />
              <b>Upgradeable</b>: you keep the UpgradeCap and can push code changes to the package
              after deployment.
            </FieldHint>
          </template>
          <template #default="{ attrs }">
            <FormSelect v-bind="attrs" v-model="form.packagePolicy">
              <option value="immutable">Immutable</option>
              <option value="upgradeable">Upgradeable</option>
            </FormSelect>
          </template>
        </FormField>

        <FormField id="recipient" label="Recipient" :error="visibleError('recipient')">
          <template #label-suffix>
            <FieldHint field-id="recipient">
              The Sui address that receives the TreasuryCap, MetadataCap, UpgradeCap (if kept),
              and any initial supply minted at deployment.
              Leave blank to send everything to the connected wallet.
              Enter a different address to separate the deployer wallet from the custody wallet.
            </FieldHint>
          </template>
          <template #default="{ attrs }">
            <input v-bind="attrs" v-model="form.recipient" placeholder="0x…" autocomplete="off" @blur="onBlur('recipient')" />
          </template>
        </FormField>

        <LicensePicker v-model="form.license" @name="form.licenseName = $event" />
      </fieldset>
    </details>

    <div class="row" style="margin-top: 1rem">
      <button type="submit" class="primary" :disabled="!canProceed">Review &amp; deploy</button>
    </div>
  </form>
</template>
