<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useWallet, useNetwork, WalletGuard } from '@meddleware/wallet-adapter'
import ConfigForm, { type ConfigFormStep } from './ConfigForm.vue'
import ReviewPanel from './ReviewPanel.vue'
import DeployProgress from './DeployProgress.vue'
import ResultPanel from './ResultPanel.vue'
import TermsDialog from './TermsDialog.vue'
import { UiNotice, UiStepper, type StepperStep } from '@meddleware/ui'
import { emptyForm, toTokenConfig } from '../lib/form.js'
import { validateForm } from '../lib/validation.js'
import type { FormErrors } from '../lib/validation.js'
import { deployToken } from '../lib/deploy.js'
import type { DeployStep } from '../lib/deploy.js'
import { buildDeployExecutor } from '../lib/deployExecutor.js'
import { FEE_MIST, FEE_TREASURY, PUBLISH_GAS_BUDGET, isFeeConfigured } from '../config.js'
import { extractErrorMessage } from '../lib/errors.js'
import type { Network, PublishResult } from '../lib/types.js'

type Step = 'identity' | 'token' | 'settings' | 'review' | 'deploying' | 'done'

const STEPS: StepperStep[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'token', label: 'Token' },
  { id: 'settings', label: 'Settings' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

const CONFIG_STEPS: ConfigFormStep[] = ['identity', 'token', 'settings']

const { account } = useWallet()
const { network } = useNetwork()

const form = reactive(emptyForm())
const step = ref<Step>('identity')
const deployStep = ref<DeployStep | null>(null)
const deployError = ref<string | null>(null)
const result = ref<PublishResult | null>(null)
const termsAccepted = ref(localStorage.getItem('sui-deployer:terms-accepted') === '1')
const showTerms = ref(false)

const errors = computed(() => validateForm(form))
const config = computed(() => toTokenConfig(form))
const connected = computed(() => Boolean(account.value))

const IDENTITY_KEYS: (keyof FormErrors)[] = ['packageName', 'moduleName']
const TOKEN_KEYS: (keyof FormErrors)[] = ['name', 'symbol', 'description', 'iconUrl', 'decimals']
const SETTINGS_KEYS: (keyof FormErrors)[] = ['initialSupply', 'recipient']

function stepHasErrors(keys: (keyof FormErrors)[]): boolean {
  return keys.some((k) => Boolean(errors.value[k]))
}

const canProceed = computed((): boolean => {
  if (!connected.value) return false
  switch (step.value) {
    case 'identity': return !stepHasErrors(IDENTITY_KEYS)
    case 'token': return !stepHasErrors(TOKEN_KEYS)
    case 'settings': return !stepHasErrors(SETTINGS_KEYS)
    default: return true
  }
})

const formStep = computed((): ConfigFormStep => {
  if (step.value === 'token') return 'token'
  if (step.value === 'settings') return 'settings'
  return 'identity'
})

const stepIndex = computed((): number => {
  const map: Record<Step, number> = {
    identity: 0,
    token: 1,
    settings: 2,
    review: 3,
    deploying: 3,
    done: 4,
  }
  return map[step.value]
})

function onStepperBack(i: number): void {
  const configStepAt = CONFIG_STEPS[i]
  if (configStepAt && step.value === 'review') step.value = configStepAt
  if (i < stepIndex.value && CONFIG_STEPS.includes(step.value as ConfigFormStep)) {
    step.value = CONFIG_STEPS[i] ?? 'identity'
  }
}

function goNext(): void {
  if (!canProceed.value) return
  if (step.value === 'identity') { step.value = 'token'; return }
  if (step.value === 'token') { step.value = 'settings'; return }
  if (step.value === 'settings') {
    if (!termsAccepted.value) { showTerms.value = true; return }
    step.value = 'review'
  }
}

function goBack(): void {
  if (step.value === 'token') { step.value = 'identity'; return }
  if (step.value === 'settings') { step.value = 'token'; return }
  if (step.value === 'review') { step.value = 'settings'; return }
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
  step.value = 'identity'
}
</script>

<template>
  <WalletGuard message="Connect a Sui wallet to deploy your token.">
    <UiStepper :steps="STEPS" :model-value="stepIndex" @update:model-value="onStepperBack" />
    <ConfigForm
      v-if="step === 'identity' || step === 'token' || step === 'settings'"
      :form="form"
      :errors="errors"
      :can-proceed="canProceed"
      :network="network"
      :connected="connected"
      :form-step="formStep"
      @next="goNext"
      @back="goBack"
    />
    <ReviewPanel
      v-if="step === 'review'"
      :config="config"
      :network="network"
      @back="goBack"
      @confirm="confirmDeploy"
    />
    <DeployProgress v-if="step === 'deploying'" :step="deployStep" />
    <ResultPanel
      v-if="step === 'done' && result"
      :result="result"
      :config="config"
      @restart="restart"
    />
    <UiNotice v-if="deployError" type="error">{{ deployError }}</UiNotice>
    <TermsDialog :open="showTerms" @accept="onTermsAccept" @cancel="onTermsCancel" />
  </WalletGuard>
</template>
