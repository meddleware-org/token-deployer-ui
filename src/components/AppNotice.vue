<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ type?: 'info' | 'error' | 'ok' }>()

const role = computed(() => {
  if (props.type === 'error') return 'alert'
  if (props.type === 'ok') return 'status'
  return undefined
})
</script>

<template>
  <p :class="['notice', type && type !== 'info' ? type : '']" :role="role"><slot /></p>
</template>
