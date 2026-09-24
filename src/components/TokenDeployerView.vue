<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useWallet, useNetwork, WalletGuard } from '@meddleware/wallet-adapter'
import ConfigForm from './ConfigForm.vue'
import ReviewPanel from './ReviewPanel.vue'
import DeployProgress from './DeployProgress.vue'
import ResultPanel from './ResultPanel.vue'
import TermsDialog from './TermsDialog.vue'
import AppNotice from './AppNotice.vue'
import { emptyForm, toTokenConfig } from '../lib/form.js'
import { validateForm, isValid } from '../lib/validation.js'
import { deployToken } from '../lib/deploy.js'
import type { DeployStep } from '../lib/deploy.js'
import { buildDeployExecutor } from '../lib/deployExecutor.js'
import { FEE_MIST, FEE_TREASURY, PUBLISH_GAS_BUDGET, isFeeConfigured } from '../config.js'
import { extractErrorMessage } from '../lib/errors.js'
import type { Network, PublishResult } from '../lib/types.js'

type Step = 'form' | 'review' | 'deploying' | 'done'

const { account } = useWallet()
const { network } = useNetwork()

const form = reactive(emptyForm())
const step = ref<Step>('form')
const deployStep = ref<DeployStep | null>(null)
const deployError = ref<string | null>(null)
const result = ref<PublishResult | null>(null)
const termsAccepted = ref(localStorage.getItem('sui-deployer:terms-accepted') === '1')
const showTerms = ref(false)

const errors = computed(() => validateForm(form))
const config = computed(() => toTokenConfig(form))
const connected = computed(() => Boolean(account.value))
const canProceed = computed(() => isValid(errors.value) && connected.value)

function goReview(): void {
  if (!canProceed.value) return
  if (!termsAccepted.value) { showTerms.value = true; return }
  step.value = 'review'
}

function onTermsAccept(): void {
  localStorage.setItem('sui-deployer:terms-accepted', '1')
  termsAccepted.value = true
  showTerms.value = false
  step.value = 'review'
}

function onTermsCancel(): void {
  showTerms.value = false
}

async function confirmDeploy(): Promise<void> {
  const sender = account.value?.address
  if (!sender) { deployError.value = 'Connect a wallet first.'; return }
  deployError.value = null
  step.value = 'deploying'
  deployStep.value = null
  try {
    const net = network.value as Network
    const feeConfigured = isFeeConfigured(net)
    result.value = await deployToken({
      config: config.value,
      network: net,
      sender,
      feeMist: feeConfigured ? FEE_MIST : 0n,
      feeTreasury: FEE_TREASURY[net],
      gasBudget: PUBLISH_GAS_BUDGET,
      executor: await buildDeployExecutor(net),
      onStep: (s) => (deployStep.value = s),
    })
    step.value = 'done'
  } catch (e) {
    deployError.value = extractErrorMessage(e)
    step.value = 'review'
  }
}

function restart(): void {
  result.value = null
  deployError.value = null
  step.value = 'form'
}
</script>

<template>
  <WalletGuard message="Connect a Sui wallet to deploy your token.">
    <ConfigForm
      v-if="step === 'form'"
      :form="form"
      :errors="errors"
      :can-proceed="canProceed"
      :network="network"
      :connected="connected"
      @submit="goReview"
    />
    <ReviewPanel
      v-if="step === 'review'"
      :config="config"
      :network="network"
      @back="step = 'form'"
      @confirm="confirmDeploy"
    />
    <DeployProgress v-if="step === 'deploying'" :step="deployStep" />
    <ResultPanel
      v-if="step === 'done' && result"
      :result="result"
      :config="config"
      @restart="restart"
    />
    <AppNotice v-if="deployError" type="error">{{ deployError }}</AppNotice>
    <TermsDialog :open="showTerms" @accept="onTermsAccept" @cancel="onTermsCancel" />
  </WalletGuard>
</template>
