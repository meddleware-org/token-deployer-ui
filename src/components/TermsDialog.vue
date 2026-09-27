<script setup lang="ts">
// Pre-deploy terms, in the shared UiDialog. Closing by any route (Cancel, Escape, backdrop,
// close button) counts as cancel; only the "continue" action accepts — UiDialog's return value
// tells them apart.
import { UiDialog } from '@meddleware/ui'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'cancel'): void
}>()

function onClose(returnValue: string): void {
  if (returnValue === 'accept') emit('accept')
  else emit('cancel')
}
</script>

<template>
  <UiDialog :open="open" title="Before you deploy" @close="onClose">
    <!-- A list: each item is a discrete, parallel term (announced with an item count). -->
    <ul class="terms">
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
    <p class="terms__confirm">
      By continuing, you confirm that you have read and accept these terms.
    </p>
    <template #actions="{ close }">
      <button type="button" class="primary" @click="close('accept')">
        I understand — continue
      </button>
      <button type="button" @click="close('cancel')">Cancel</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.terms {
  padding-left: 1.25rem;
  margin: 0;
  line-height: 1.6;
}

.terms li {
  margin-bottom: 0.6rem;
}

.terms li:last-child {
  margin-bottom: 0;
}

.terms__confirm {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
</style>
