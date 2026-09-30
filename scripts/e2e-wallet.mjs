// Shared real-chain e2e plumbing for the headless-browser harnesses (e2e-deploy.mjs,
// e2e-walrus-browser.mjs): browser launch, a wallet-standard wallet injected into the page and
// backed by a node-held keypair, and the app's connect flow.
//
// Signing never trusts the page: the wallet forwards the transaction as JSON, and node rebuilds it
// with its own gRPC client (`Transaction.from` → `tx.build({ client })`) before signing. The app
// needs no test hooks — this works against the ordinary production build.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'

export const WALLET_NAME = 'Mock Test Wallet'

/**
 * Launch headless Chromium: explicit CHROME_PATH → a locally-installed Chrome → Playwright's
 * bundled Chromium (CI installs it via `npx playwright install chromium`).
 */
export async function launchBrowser(args = []) {
  const executablePath =
    process.env.CHROME_PATH ||
    (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)
  return chromium.launch({ headless: true, executablePath, args })
}

/**
 * Register a wallet-standard wallet in `page` (before app scripts run) whose account is
 * `keypair`'s address on `chain` (e.g. `sui:testnet`). It supports `sui:signTransaction` and
 * `sui:signPersonalMessage`; both are signed node-side.
 */
export async function injectWallet(page, { keypair, client, chain }) {
  await page.exposeFunction('__e2eSignTransaction', async (txJson) => {
    const tx = Transaction.from(txJson)
    const bytes = await tx.build({ client })
    const { signature } = await keypair.signTransaction(bytes)
    return { bytes: toBase64(bytes), signature }
  })
  await page.exposeFunction('__e2eSignPersonalMessage', async (message) => {
    const { bytes, signature } = await keypair.signPersonalMessage(new Uint8Array(message))
    return { bytes, signature }
  })

  await page.addInitScript(
    ({ address, pubkey, chain, name }) => {
      const account = {
        address,
        publicKey: new Uint8Array(pubkey),
        chains: [chain],
        features: ['sui:signTransaction', 'sui:signPersonalMessage'],
        label: 'Mock',
      }
      const wallet = {
        version: '1.0.0',
        name,
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        chains: [chain],
        accounts: [account],
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
          'standard:events': { version: '1.0.0', on: () => () => {} },
          'sui:signTransaction': {
            version: '2.0.0',
            signTransaction: async (input) => {
              // A real wallet sets the sender from the connected account; do the same.
              input.transaction.setSenderIfNotSet(input.account.address)
              return window.__e2eSignTransaction(await input.transaction.toJSON())
            },
          },
          'sui:signPersonalMessage': {
            version: '1.0.0',
            signPersonalMessage: async (input) =>
              window.__e2eSignPersonalMessage(Array.from(input.message)),
          },
        },
      }
      const callback = ({ register }) => register(wallet)
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: callback }))
      window.addEventListener('wallet-standard:app-ready', (e) => callback(e.detail))
    },
    {
      address: keypair.toSuiAddress(),
      pubkey: Array.from(keypair.getPublicKey().toRawBytes()),
      chain,
      name: WALLET_NAME,
    },
  )
}

/**
 * Connect the injected wallet through the app's dialog, selecting `appNetwork` first when it is
 * not the testnet default.
 */
export async function connectWallet(page, appNetwork = 'testnet') {
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click()
  if (appNetwork !== 'testnet') {
    await page.locator('#dialog-network-select').selectOption(appNetwork)
  }
  await page.getByRole('button', { name: new RegExp(WALLET_NAME) }).click()
  await page.getByText(new RegExp(`${WALLET_NAME} ·`)).waitFor({ timeout: 10000 })
}
