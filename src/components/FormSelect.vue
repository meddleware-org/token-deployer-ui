<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string>()
</script>

<template>
  <div class="select-wrapper">
    <select v-bind="$attrs" v-model="model"><slot /></select>
    <svg
      class="select-chevron"
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="8"
      viewBox="0 0 12 8"
      aria-hidden="true"
    >
      <path d="M1 1l5 5 5-5" />
    </svg>
  </div>
</template>

<style scoped>
.select-wrapper {
  position: relative;
}

.select-wrapper select {
  appearance: none;
  padding-right: 2.5rem;
  width: 100%;
}

.select-chevron {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  stroke: var(--muted);
  stroke-width: 1.5;
  fill: none;
}
</style>
