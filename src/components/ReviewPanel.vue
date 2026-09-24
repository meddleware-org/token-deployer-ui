<script setup lang="ts">
import type { TokenConfig, Network } from '../lib/types.js'
import { FEE_MIST } from '../config.js'
import AppNotice from './AppNotice.vue'

const props = defineProps<{ config: TokenConfig; network: Network }>()
defineEmits<{ (e: 'back'): void; (e: 'confirm'): void }>()

const feeSui = Number(FEE_MIST) / 1e9
</script>

<template>
  <section class="card" aria-labelledby="review-h">
    <h2 id="review-h">Review — deploying to {{ props.network }}</h2>

    <AppNotice>
      These values are <strong>permanent</strong> once published: symbol
      <span class="mono">{{ config.symbol }}</span
      >, name <span class="mono">{{ config.name }}</span
      >, decimals <span class="mono">{{ config.decimals }}</span
      >, and the coin type
      <span class="mono">&lt;package&gt;::{{ config.moduleName }}::{{ config.structName }}</span
      >.
    </AppNotice>

    <dl class="grid2" v-once>
      <div>
        <dt>Initial supply</dt>
        <dd>{{ config.initialSupply.toString() }}</dd>
      </div>
      <div>
        <dt>Supply policy</dt>
        <dd>{{ config.supplyPolicy }}</dd>
      </div>
      <div>
        <dt>Metadata</dt>
        <dd>{{ config.metadataPolicy }}</dd>
      </div>
      <div>
        <dt>Package code</dt>
        <dd>{{ config.packagePolicy }}</dd>
      </div>
      <div>
        <dt>License (source only)</dt>
        <dd>{{ config.license }}</dd>
      </div>
      <div>
        <dt>Recipient</dt>
        <dd class="mono">{{ config.recipient || 'your wallet' }}</dd>
      </div>
    </dl>

    <p v-once class="hint">
      Your wallet signs and pays gas. A one-off fee of <strong>{{ feeSui }} SUI</strong> is included
      in the publish transaction. Nothing is compiled or signed on a server.
    </p>

    <p v-once class="hint">
      You are the sole author of this token and fully responsible for its details and use. This tool
      does not review, verify, or endorse tokens or their creators, and takes no custody of your
      token or caps.
    </p>

    <div class="row" style="margin-top: 1rem">
      <button type="button" @click="$emit('back')">Back</button>
      <button type="button" class="primary" @click="$emit('confirm')">Confirm &amp; deploy</button>
    </div>
  </section>
</template>
