<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useWallet, useNetwork, WalletGuard } from '@meddleware/wallet-adapter'
import ConfigForm, { type ConfigFormStep } from './ConfigForm.vue'
import ReviewPanel from './ReviewPanel.vue'
import DeployProgress from './DeployProgress.vue'
import ResultPanel from './ResultPanel.vue'
import TermsDialog from './TermsDialog.vue'
import MyTokens from './MyTokens.vue'
import {
  AppTabNav,
  UiButton,
  UiNotice,
  UiStepper,
  UiTabPanel,
  UiToolIntro,
  type AppTab,
  type StepperStep,
} from '@meddleware/ui'
import { emptyForm, toTokenConfig } from '../lib/form.js'
import { validateForm } from '../lib/validation.js'
import type { FormErrors } from '../lib/validation.js'
import { useDeploy } from '../composables/useDeploy.js'
import { browserStorage } from '@meddleware/walrus-client/flow'
import { FEE_MIST, FEE_TREASURY, PUBLISH_GAS_BUDGET, isFeeConfigured } from '../config.js'
import type { TokenNetwork as Network } from '@meddleware/sui-token-client'

type Step = 'identity' | 'token' | 'settings' | 'review' | 'deploying' | 'incomplete' | 'published' | 'done'

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

// Top-level tabs — Deploy (the wizard) and My Tokens (coins this wallet has deployed), so the
// layout matches the other Sui tools (intro → tabs → content).
const TABS: AppTab[] = [
  { id: 'deploy', label: 'Deploy' },
  { id: 'my-tokens', label: 'My Tokens' },
]
const activeTab = ref('deploy')

const form = reactive(emptyForm())
const step = ref<Step>('identity')
const flow = useDeploy()
const deployStep = flow.step
const result = flow.result
// A wallet message ("Connect a wallet first.") or the flow's error.
const walletError = ref<string | null>(null)
const deployError = computed(() => walletError.value ?? flow.error.value)
// The flow decides the step once it leaves `deploying`: a failure before publishing returns to the
// review; anything after a publish never does (a second deploy would publish a second coin).
watch(flow.phase, (phase) => {
  if (phase === 'deploying') step.value = 'deploying'
  else if (phase === 'done') step.value = 'done'
  else if (phase === 'incomplete') step.value = 'incomplete'
  else if (phase === 'published') step.value = 'published'
  else if (phase === 'failed') step.value = 'review'
})
// Storage that never throws: with site data blocked the terms are simply asked again next visit.
const storage = browserStorage()
const termsAccepted = ref(storage.getItem('sui-deployer:terms-accepted') === '1')
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
    case 'identity':
      return !stepHasErrors(IDENTITY_KEYS)
    case 'token':
      return !stepHasErrors(TOKEN_KEYS)
    case 'settings':
      return !stepHasErrors(SETTINGS_KEYS)
    default:
      return true
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
    incomplete: 3,
    published: 3,
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
  if (step.value === 'identity') {
    step.value = 'token'
    return
  }
  if (step.value === 'token') {
    step.value = 'settings'
    return
  }
  if (step.value === 'settings') {
    if (!termsAccepted.value) {
      showTerms.value = true
      return
    }
    step.value = 'review'
  }
}

function goBack(): void {
  if (step.value === 'token') {
    step.value = 'identity'
    return
  }
  if (step.value === 'settings') {
    step.value = 'token'
    return
  }
  if (step.value === 'review') {
    step.value = 'settings'
    return
  }
}

function onTermsAccept(): void {
  storage.setItem('sui-deployer:terms-accepted', '1')
  termsAccepted.value = true
  showTerms.value = false
  step.value = 'review'
}

function onTermsCancel(): void {
  showTerms.value = false
}

async function confirmDeploy(): Promise<void> {
  const sender = account.value?.address
  if (!sender) {
    walletError.value = 'Connect a wallet first.'
    return
  }
  walletError.value = null
  const net = network.value as Network
  const feeConfigured = isFeeConfigured(net)
  await flow.deploy({
    config: config.value,
    network: net,
    sender,
    feeMist: feeConfigured ? FEE_MIST : 0n,
    feeTreasury: FEE_TREASURY[net],
    gasBudget: PUBLISH_GAS_BUDGET,
  })
}

function restart(): void {
  flow.reset()
  walletError.value = null
  step.value = 'identity'
}
</script>

<template>
  <div class="mw-token-deployer">
    <UiToolIntro
      >Deploy your own Sui coin — your wallet signs and pays; no intermediaries ({{
        network
      }}).</UiToolIntro
    >

    <AppTabNav
      v-model="activeTab"
      :tabs="TABS"
      id-prefix="token-deployer"
      aria-label="Sections"
      class="deployer-tabs"
    />

    <!-- The tab list and its panel always render (the selected tab controls a live panel); the wallet
         prompt replaces only the panel's content until a wallet is connected. -->
    <UiTabPanel id-prefix="token-deployer" :tab="activeTab">
      <WalletGuard message="Connect a Sui wallet to deploy your token.">
        <template v-if="activeTab === 'deploy'">
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
          <section v-if="step === 'incomplete' && flow.pending.value" class="deploy-incomplete" aria-labelledby="incomplete-h">
            <h2 id="incomplete-h">Your coin is published — finish its setup</h2>
            <p>
              <code>{{ flow.pending.value.result.coinType }}</code> exists on {{ flow.pending.value.result.network }},
              but the second transaction did not complete: the currency is not registered, the initial supply
              is not minted and your supply and metadata choices are not applied yet. The caps are in your
              wallet.
            </p>
            <p>Do not deploy again — that would publish a second coin. Sign the setup transaction instead.</p>
            <UiButton variant="primary" @click="flow.finish()">Finish setup (sign again)</UiButton>
          </section>
          <section v-if="step === 'published'" class="deploy-incomplete" aria-labelledby="published-h">
            <h2 id="published-h">A coin was published, but the result could not be read</h2>
            <p>
              Publish transaction <code>{{ flow.publishDigest.value }}</code>. Check it in an explorer before
              doing anything else; do not deploy again.
            </p>
            <UiButton variant="ghost" @click="restart">Start a new token</UiButton>
          </section>
          <ResultPanel
            v-if="step === 'done' && result"
            :result="result"
            :config="config"
            @restart="restart"
          />
          <UiNotice v-if="deployError" type="error">{{ deployError }}</UiNotice>
        </template>

        <MyTokens v-else :owner="account?.address ?? null" :network="network" />
      </WalletGuard>
    </UiTabPanel>

    <TermsDialog :open="showTerms" @accept="onTermsAccept" @cancel="onTermsCancel" />
  </div>
</template>

<style scoped>
.deployer-tabs {
  margin: 0 0 1rem;
}

.deploy-incomplete {
  margin: 1rem 0;
}
</style>
