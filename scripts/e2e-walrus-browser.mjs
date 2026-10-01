// Headless-browser verification of the Walrus icon-upload widget on TESTNET (manual only — it
// spends real SUI + WAL). Injects a wallet-standard wallet backed by the funded keypair
// (SUI_PRIV), drives the widget's upload, and asserts the icon field is filled with an aggregator
// URL that serves the exact uploaded image.
//
//   APP_URL / E2E_TAB   the app to drive (default the local preview). The gateway Worker only
//                       allows CORS from its ALLOWED_ORIGINS (sui-walrus., dash.), so a local
//                       build cannot reach the operator relay and falls back to the public one.
//                       To test the gated relay, run against the dashboard:
//                       APP_URL=https://dash.meddleware.co.uk/blockchain E2E_TAB="Token Deployer"
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
  // Relay diagnostics: the operator-relay health check (/v1/tip-config) decides which relay the
  // widget offers, so log its outcome and any failed relay request.
  page.on('response', (r) => {
    if (r.url().endsWith('/v1/tip-config')) console.log(`[relay] ${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', (r) => {
    if (/tip-config|blob-upload-relay/.test(r.url())) console.log(`[relay] FAILED ${r.url()}: ${r.failure()?.errorText}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200))
  })

  await injectWallet(page, { keypair, client, chain: 'sui:testnet' })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  if (process.env.E2E_TAB) {
    await page.getByRole('tab', { name: process.env.E2E_TAB }).click()
  }
  await connectWallet(page, 'testnet')
  console.log('wallet connected')

  // The deploy form is a wizard; the icon picker is on step 2 (token details). Step 1 needs a
  // valid package + module name before Next is enabled (same as e2e/app.spec.ts).
  await page.locator('#package').fill('walrus_e2e')
  await page.locator('#module').fill('walruse2e')
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  // UiSegmentedControl hides the native radio and styles its label: click the label, as a user does.
  const uploadTab = page.getByRole('radio', { name: 'Upload to Walrus' })
  await page.locator('label', { has: uploadTab }).click()
  if (!(await uploadTab.isChecked())) fail('the "Upload to Walrus" source did not select')
  await page.locator('#walrus-file').setInputFiles(icon)

  // Relay policy (walrus-relay useWalrusRelay, anti-bypass): while the operator relay is
  // configured and reachable it is the ONLY option — a wallet without a pass gets the purchase CTA
  // instead, and the free public relay is withheld. The public relay is offered only when no
  // operator relay is configured or it is down, so E2E_RELAY=public needs a build without
  // VITE_WALRUS_RELAY_TESTNET.
  const purchase = page.getByRole('button', { name: 'Purchase relay access' })
  const uploadButton = page.getByRole('button', { name: /Upload to Walrus/ })
  const settle = async () => {
    for (let i = 0; i < 40; i++) {
      if (await purchase.isVisible()) return 'purchase'
      if (await uploadButton.isEnabled()) return 'ready'
      await page.waitForTimeout(500)
    }
    return 'timeout'
  }
  let state = await settle()
  if (state === 'purchase') {
    if (RELAY !== 'operator') fail('the operator relay is up, so the public relay is withheld; build without VITE_WALRUS_RELAY_TESTNET for E2E_RELAY=public')
    console.log('no access pass — purchasing one (1 wallet approval)…')
    await purchase.click()
    await purchase.waitFor({ state: 'detached', timeout: 60000 })
    state = await settle()
  }
  if (state !== 'ready') fail(`upload never became available (${state})`)

  // Record which relay host the upload goes to, so the run proves the path it claims to test.
  const relayHosts = new Set()
  page.on('request', (r) => {
    if (/\/v1\/blob-upload-relay/.test(r.url())) relayHosts.add(new URL(r.url()).host)
  })

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

  const hosts = [...relayHosts]
  console.log('upload relay host(s):', hosts.join(', ') || '(none seen)')
  const operatorHost = 'sui-walrus-relay-testnet.meddleware.co.uk'
  if (RELAY === 'operator' && !hosts.includes(operatorHost)) fail(`upload did not go through ${operatorHost}`)
  if (RELAY === 'public' && hosts.includes(operatorHost)) fail('upload went through the operator relay')

  console.log(`\nWALRUS BROWSER E2E PASS ✓ (${RELAY} relay upload → renderable icon URL on testnet)`)
}

main().catch((e) => fail(e.message))
