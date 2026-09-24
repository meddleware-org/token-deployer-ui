// Headless browser verification of the Walrus icon-upload widget on TESTNET.
// Injects a wallet-standard wallet backed by the FUNDED keypair (SUI_PRIV env),
// drives the widget's file upload, and asserts the icon field is filled with a
// working aggregator URL that serves the exact uploaded image.
//
// Prereq: build the app + serve on APP_URL, and export SUI_PRIV for the funded
// testnet address (with SUI + WAL).

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { toBase64 } from '@mysten/sui/utils'

const APP_URL = process.env.APP_URL || 'http://localhost:4173'
const RPC = process.env.RPC || 'https://sui-testnet-rpc.publicnode.com'
const ICON = '/tmp/test-icon.svg'

const _client = new SuiJsonRpcClient({ url: RPC, network: 'testnet' })
const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIV)
const address = keypair.toSuiAddress()

function fail(m) {
  console.error('WALRUS BROWSER E2E FAIL:', m)
  process.exit(1)
}

async function main() {
  console.log('signer:', address)
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    // Bypass CORS so the in-browser tx.build() can hit the testnet RPC.
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  // Node just signs raw bytes; the browser builds the tx (resolving CoinWithBalance).
  await page.exposeFunction('__mockSignBytes', async (byteArr) => {
    const bytes = new Uint8Array(byteArr)
    const { signature } = await keypair.signTransaction(bytes)
    return { bytes: toBase64(bytes), signature }
  })

  await page.addInitScript(
    ({ address, pubkey }) => {
      const account = { address, publicKey: new Uint8Array(pubkey), chains: ['sui:testnet'], features: ['sui:signTransaction'], label: 'Mock' }
      const wallet = {
        version: '1.0.0', name: 'Mock Test Wallet',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        chains: ['sui:testnet'], accounts: [account],
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
          'standard:events': { version: '1.0.0', on: () => () => {} },
          'sui:signTransaction': {
            version: '2.0.0',
            signTransaction: async (input) => {
              // A real wallet sets the sender from the connected account; do the same.
              const client = window.__getSuiClient('testnet')
              input.transaction.setSenderIfNotSet(input.account.address)
              const bytes = await input.transaction.build({ client })
              return window.__mockSignBytes(Array.from(bytes))
            },
          },
        },
      }
      const cb = ({ register }) => register(wallet)
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: cb }))
      window.addEventListener('wallet-standard:app-ready', (e) => cb(e.detail))
    },
    { address, pubkey: Array.from(keypair.getPublicKey().toRawBytes()) },
  )

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Connect Mock Test Wallet/ }).click()
  await page.getByText(/Mock Test Wallet ·/).waitFor({ timeout: 10000 })
  console.log('wallet connected')

  // Drive the widget: choose the file + click upload.
  await page.locator('#walrus-file').setInputFiles(ICON)
  await page.getByRole('button', { name: /Upload to Walrus/ }).click()
  console.log('uploading to Walrus (2 wallet approvals, relay)…')

  // Wait for the icon field to be populated with an aggregator URL.
  // (arg must precede options in waitForFunction.)
  try {
    await page.waitForFunction(
      () => (document.querySelector('#icon') ?? {}).value?.includes('/v1/blobs/'),
      undefined,
      { timeout: 180000, polling: 1000 },
    )
  } catch (e) {
    const status = await page.locator('.hint[aria-live]').allInnerTexts().catch(() => [])
    const err = await page.locator('.field-error').allInnerTexts().catch(() => [])
    console.log('widget status:', JSON.stringify(status))
    console.log('widget errors:', JSON.stringify(err))
    throw e
  }
  const url = await page.locator('#icon').inputValue()
  console.log('icon URL:', url)
  await browser.close()

  if (!url.includes('aggregator.walrus-testnet') || !url.includes('/v1/blobs/')) fail(`unexpected URL: ${url}`)
  const res = await fetch(url)
  const body = new Uint8Array(await res.arrayBuffer())
  const expected = new Uint8Array(readFileSync(ICON))
  const match = body.length === expected.length && body.every((b, i) => b === expected[i])
  console.log('aggregator serves', body.length, 'bytes, matches uploaded image:', match)
  if (!match) fail('aggregator content does not match uploaded image')

  console.log('\nWALRUS BROWSER E2E PASS ✓ (widget upload -> renderable icon URL on testnet)')
}

main().catch((e) => fail(e.message))
