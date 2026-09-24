<script setup lang="ts">
defineProps<{ fieldId: string }>()

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur()
}
</script>

<template>
  <span class="field-hint">
    <button
      type="button"
      class="field-hint-btn"
      :aria-describedby="`${fieldId}-hint`"
      aria-label="Help"
      @keydown="onKeyDown"
    >?</button>
    <span :id="`${fieldId}-hint`" role="tooltip" class="field-hint-tip">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.field-hint {
  position: relative;
  display: inline-block;
  margin-left: 0.35rem;
  vertical-align: middle;
}

.field-hint-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1em;
  height: 1.1em;
  padding: 0;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  border-radius: 50%;
  border: 1px solid var(--muted);
  color: var(--muted);
  background: transparent;
  cursor: help;
}

.field-hint-tip {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  min-width: 200px;
  max-width: min(300px, 90vw);
  padding: 0.6rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  visibility: hidden;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
  pointer-events: none;
}

.field-hint:hover .field-hint-tip,
.field-hint:focus-within .field-hint-tip {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}
</style>
