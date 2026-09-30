// Headless-browser verification of the Walrus icon-upload widget on TESTNET (manual only — it
// spends real SUI + WAL). Injects a wallet-standard wallet backed by the funded keypair
// (SUI_PRIV), drives the widget's upload, and asserts the icon field is filled with an aggregator
// URL that serves the exact uploaded image.
//
//   E2E_RELAY=public    (default) the free public relay — register → upload → certify.
//   E2E_RELAY=operator  the NFT-gated operator relay — buys an access pass if the account has
//                       none, then consume (single-use gates) + signed access proof → register →
//                       upload → certify. Needs a build with VITE_ACCESS_GATE_*_TESTNET and
//                       VITE_WALRUS_RELAY_TESTNET set (e.g. in a local .env.production).
//
// Run via `npm run e2e:walrus` (builds, serves dist on APP_URL, runs this). Requires SUI_PRIV
// (bech32 suiprivkey1…) for an address holding testnet SUI and WAL.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { launchBrowser, injectWallet, connectWallet } from './e2e-wallet.mjs'

const APP_URL = process.env.APP_URL || 'http://localhost:4173'
const RPC = process.env.E2E_RPC || 'https://fullnode.testnet.sui.io:443'
const RELAY = process.env.E2E_RELAY || 'public'
const UPLOAD_TIMEOUT = Number(process.env.E2E_UPLOAD_TIMEOUT || '180000')

function fail(m) {
  console.error('WALRUS BROWSER E2E FAIL:', m)
  process.exit(1)
}

if (!['public', 'operator'].includes(RELAY)) fail(`E2E_RELAY must be public|operator (got "${RELAY}")`)
if (!process.env.SUI_PRIV) fail('SUI_PRIV is required (a funded testnet key with SUI + WAL).')

const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIV)
const address = keypair.toSuiAddress()
const client = new SuiGrpcClient({ baseUrl: RPC, network: 'testnet' })

/** A small, unique SVG so every run uploads (and verifies) fresh content. */
function writeIcon() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    `<rect width="64" height="64" fill="#177542"/><text x="4" y="36" font-size="8">${Date.now()}</text></svg>`
  const path = join(mkdtempSync(join(tmpdir(), 'walrus-e2e-')), 'icon.svg')
  writeFileSync(path, svg)
  return path
}

async function main() {
  const { balance } = await client.getBalance({ owner: address })
  console.log('signer:', address, 'SUI balance:', balance.balance, 'MIST', 'relay:', RELAY)
  if (BigInt(balance.balance) === 0n) fail(`${address} has no testnet SUI`)

  const icon = writeIcon()
  const browser = await launchBrowser()
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  await injectWallet(page, { keypair, client, chain: 'sui:testnet' })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await connectWallet(page, 'testnet')
  console.log('wallet connected')

  await page.getByRole('radio', { name: 'Upload to Walrus' }).check()
  await page.locator('#walrus-file').setInputFiles(icon)

  const relayChoice = page.locator('fieldset.relay-choice')
  if (RELAY === 'operator') {
    if (!(await relayChoice.isVisible())) fail('no operator relay in this build (VITE_WALRUS_RELAY_TESTNET unset?)')
    await relayChoice.getByRole('radio', { name: /Operator relay/ }).check()
    const purchase = page.getByRole('button', { name: 'Purchase relay access' })
    if (await purchase.isVisible()) {
      console.log('no access pass — purchasing one (1 wallet approval)…')
      await purchase.click()
      await purchase.waitFor({ state: 'detached', timeout: 60000 })
    }
  } else if (await relayChoice.isVisible()) {
    await relayChoice.getByRole('radio', { name: /Public relay/ }).check()
  }

  await page.getByRole('button', { name: /Upload to Walrus/ }).click()
  console.log(`uploading via the ${RELAY} relay…`)

  try {
    await page.waitForFunction(
      () => (document.querySelector('#icon') ?? {}).value?.includes('/v1/blobs/'),
      undefined,
      { timeout: UPLOAD_TIMEOUT, polling: 1000 },
    )
  } catch (e) {
    const status = await page.locator('#walrus-help').allInnerTexts().catch(() => [])
    const err = await page.locator('.field-error').allInnerTexts().catch(() => [])
    console.log('widget status:', JSON.stringify(status))
    console.log('widget errors:', JSON.stringify(err))
    throw e
  }
  const url = await page.locator('#icon').inputValue()
  console.log('icon URL:', url)
  await browser.close()

  if (!url.includes('/v1/blobs/')) fail(`unexpected URL: ${url}`)
  const res = await fetch(url)
  const body = new Uint8Array(await res.arrayBuffer())
  const expected = new Uint8Array(readFileSync(icon))
  const match = body.length === expected.length && body.every((b, i) => b === expected[i])
  console.log('aggregator serves', body.length, 'bytes, matches uploaded image:', match)
  if (!match) fail('aggregator content does not match uploaded image')

  console.log(`\nWALRUS BROWSER E2E PASS ✓ (${RELAY} relay upload → renderable icon URL on testnet)`)
}

main().catch((e) => fail(e.message))
