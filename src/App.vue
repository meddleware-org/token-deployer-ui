<script setup lang="ts">
import WalletBar from './components/WalletBar.vue'
import TokenDeployerView from './components/TokenDeployerView.vue'
import ColorModeControl from './components/ColorModeControl.vue'
import { useColorMode } from './composables/useColorMode.js'

const { mode: colorMode, set: setColorMode } = useColorMode('system')
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <main id="main-content">
    <div class="theme-bar">
      <ColorModeControl :model-value="colorMode" @update:model-value="setColorMode" />
    </div>
    <header v-once>
      <h1>Create your own Sui coin</h1>
      <p class="lede">
        Deploy a coin on Sui directly from your browser. Your wallet signs and pays gas — nothing is
        compiled or signed on a server — and you keep the full, verifiable source package.
      </p>
    </header>

    <WalletBar />

    <TokenDeployerView />

    <footer v-once style="margin-top: 3rem; color: var(--muted); font-size: 0.9rem">
      <p>
        Client-side token deployment. This tool never takes custody of your token or keys. Symbol,
        name, and decimals are permanent once published.
      </p>
      <p>
        <strong>No endorsement.</strong> This is a neutral, self-serve tool. It does not review,
        verify, or endorse any token created with it, nor its creator. A token existing here implies
        nothing about its legitimacy or value — always do your own research before acquiring or
        trading any coin.
      </p>
    </footer>
  </main>
</template>
