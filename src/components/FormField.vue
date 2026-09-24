<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  id: string
  label: string
  error?: string | null
  hint?: string
}>()

const errorId = computed(() => `${props.id}-err`)
const slotAttrs = computed(() => ({
  id: props.id,
  'aria-invalid': props.error ? (true as const) : undefined,
  'aria-describedby': props.error ? errorId.value : undefined,
}))
</script>

<template>
  <div class="form-field">
    <label :for="id">
      {{ label }}<slot name="label-suffix" />
    </label>
    <slot :attrs="slotAttrs" />
    <p v-if="hint && !error" class="hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="field-error">{{ error }}</p>
  </div>
</template>
