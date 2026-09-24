<script lang="ts">
import type { DeployStep } from '../lib/deploy.js'

const ORDER: { key: DeployStep; label: string }[] = [
  { key: 'patching', label: 'Preparing the module' },
  { key: 'publishing', label: 'Publishing (sign in your wallet)' },
  { key: 'confirming', label: 'Confirming on-chain' },
  { key: 'finalizing', label: 'Finalizing supply & caps (sign again)' },
  { key: 'confirming-finalize', label: 'Confirming finalize' },
  { key: 'done', label: 'Done' },
]
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ step: DeployStep | null }>()

const currentIndex = computed(() => ORDER.findIndex((s) => s.key === props.step))

function getState(i: number): 'done' | 'active' | 'todo' {
  if (currentIndex.value < 0) return 'todo'
  if (i < currentIndex.value) return 'done'
  if (i === currentIndex.value) return 'active'
  return 'todo'
}

const steps = computed(() =>
  ORDER.map((s, i) => ({ ...s, state: getState(i) }))
)
</script>

<template>
  <section class="card" aria-labelledby="progress-h">
    <h2 id="progress-h">Deploying…</h2>
    <ol class="steps" aria-live="polite">
      <li v-for="s in steps" :key="s.key" :data-state="s.state">
        <span v-if="s.state === 'active'" class="spinner" aria-hidden="true"></span>
        <span v-else-if="s.state === 'done'" aria-hidden="true">✓ </span>
        {{ s.label }}
        <span v-if="s.state === 'active'" class="visually-hidden">(in progress)</span>
      </li>
    </ol>
    <p class="hint">Keep this tab open and approve the wallet prompts.</p>
  </section>
</template>
