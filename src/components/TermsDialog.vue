<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'cancel'): void
}>()

const el = ref<HTMLDialogElement>()

watch(
  () => props.open,
  (v) => (v ? el.value?.showModal() : el.value?.close()),
)
</script>

<template>
  <dialog ref="el" @click.self="$emit('cancel')" @cancel.prevent="$emit('cancel')">
    <div class="dialog-header">
      <h2>Before you deploy</h2>
    </div>
    <ul>
      <li>
        All operations — bytecode compilation, transaction construction, and signing — take place
        entirely <strong>client-side</strong>, meaning on your computer. No code runs on our
        servers, and no server has any visibility into or control over what happens on your machine.
      </li>
      <li>
        This is a neutral, self-service tool. The operator does not review, approve, or endorse any
        token deployed with it.
      </li>
      <li>
        You are solely responsible for your token, its content, and its use — including compliance
        with all applicable laws in your jurisdiction.
      </li>
      <li>
        Please don't create tokens that misrepresent projects, impersonate other assets, or
        facilitate fraud. We can't actually see what you're doing from here, but we thought we'd
        mention it. Bad vibes.
      </li>
      <li>
        On-chain transactions are irreversible. Review your configuration carefully before
        confirming.
      </li>
      <li>
        The operator accepts no liability for financial loss, legal consequences, or any harm
        arising from your use of this tool.
      </li>
    </ul>
    <p style="margin-bottom: 1.25rem; font-size: 0.9rem; color: var(--muted)">
      By continuing, you confirm that you have read and accept these terms.
    </p>
    <div class="terms-actions">
      <button type="button" class="primary" @click="$emit('accept')">I understand — continue</button>
      <button type="button" @click="$emit('cancel')">Cancel</button>
    </div>
  </dialog>
</template>

<style scoped>
ul {
  padding-left: 1.25rem;
  margin: 0 0 1rem;
  line-height: 1.6;
}

ul li {
  margin-bottom: 0.6rem;
}

ul li:last-child {
  margin-bottom: 0;
}

.terms-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
