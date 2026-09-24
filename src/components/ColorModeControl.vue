<script setup lang="ts">
import type { ColorMode } from '../composables/useColorMode'

/**
 * Presentational light/dark/system control. Owns no state — bind with `v-model`
 * to external state (`useColorMode`). Vendored mirror of `@meddleware/ui`'s
 * `ColorModeControl` for parity with the dashboard.
 * TODO(unify): consume `@meddleware/ui` once published.
 */
withDefaults(
  defineProps<{
    modelValue: ColorMode
    modes?: ColorMode[]
  }>(),
  { modes: () => ['light', 'dark', 'system'] },
)

defineEmits<{ 'update:modelValue': [ColorMode] }>()

const LABEL: Record<ColorMode, string> = { light: 'Light', dark: 'Dark', system: 'System' }
const GLYPH: Record<ColorMode, string> = { light: '☀', dark: '☾', system: '◐' }
</script>

<template>
  <div class="mode-control" role="group" aria-label="Colour mode">
    <button
      v-for="m in modes"
      :key="m"
      type="button"
      class="mode-control__btn"
      :class="{ 'is-active': modelValue === m }"
      :aria-pressed="modelValue === m"
      :title="LABEL[m]"
      @click="$emit('update:modelValue', m)"
    >
      <span aria-hidden="true">{{ GLYPH[m] }}</span>
      <span class="mode-control__label">{{ LABEL[m] }}</span>
    </button>
  </div>
</template>

<style scoped>
.mode-control {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.mode-control__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  border: 0;
  border-radius: calc(var(--radius) - 3px);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.7;
}
.mode-control__btn:hover {
  opacity: 1;
}
.mode-control__btn.is-active {
  opacity: 1;
  background: var(--lift);
}
.mode-control__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (max-width: 640px) {
  .mode-control__label {
    display: none;
  }
}
</style>
