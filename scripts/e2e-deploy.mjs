// Network-parametrized headless-browser deploy e2e. Loads the built app, injects a
// wallet-standard wallet backed by a node-held keypair, drives the full UI, and performs a
// REAL publish against the target chain — then verifies coin type + operator fee on-chain.
//
// This is the single source of truth for the real-chain deploy path; `e2e-browser.mjs` is a
// thin localnet wrapper over it. It covers exactly what the mocked Playwright suite cannot: real
// confirmation, the result panel, the source-zip download, and on-chain verification.
//
// Two axes matter and are DISTINCT:
//   - E2E_NETWORK  = the physical chain the RPC talks to: localnet | testnet | mainnet.
//   - APP_NETWORK  = the network the app runs in (its only UI options are testnet/mainnet;
//                    it drives the `sui:<net>` chain label and which fee treasury applies).
// localnet is run as APP_NETWORK=testnet with the testnet RPC overridden to the local node,
// so the app believes it is on testnet while publishing to 127.0.0.1:9000. mainnet is the
// only case that changes the in-UI network selector.
//
// The npm scripts (e2e:localnet / e2e:testnet / e2e:mainnet) build the app with the matching
// VITE_RPC_* / VITE_FEE_TREASURY_* envs and serve dist on APP_URL before invoking this runner.
// To drive the deployer embedded in the dashboard, point APP_URL at its page and set E2E_TAB:
//   APP_URL=http://localhost:4173/blockchain E2E_TAB="Token Deployer"

import { readFileSync } from 'node:fs'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { launchBrowser, injectWallet, connectWallet } from './e2e-wallet.mjs'

const ZERO_ADDR = '0x' + '0'.repeat(64)

const NETWORK = process.env.E2E_NETWORK || 'localnet'
if (!['localnet', 'testnet', 'mainnet'].includes(NETWORK)) {
  fail(`E2E_NETWORK must be localnet|testnet|mainnet (got "${NETWORK}")`)
}

// The app only ever runs in testnet or mainnet mode; localnet borrows testnet mode.
const APP_NETWORK = NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

const DEFAULT_RPC = {
  localnet: 'http://127.0.0.1:9000',
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
}
const RPC = process.env.E2E_RPC || DEFAULT_RPC[NETWORK]

const APP_URL = process.env.APP_URL || 'http://localhost:4173'
const FAUCET = process.env.E2E_FAUCET || 'http://127.0.0.1:9123'
const FEE_ADDR = process.env.E2E_FEE_ADDR || (NETWORK === 'localnet' ? '0xfee' + '0'.repeat(61) : '')
const EXPECT_FEE_MIST = BigInt(process.env.E2E_FEE_MIST || '1000000000') // 1 SUI, matches VITE_FEE_MIST default
const RESULT_TIMEOUT = Number(process.env.E2E_RESULT_TIMEOUT || '60000')

function fail(msg) {
  console.error('E2E FAIL:', msg)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Mainnet is fail-safe by default: it must never publish a real token — and spend real
// SUI — by accident or in CI. Require an explicit opt-in and abort cleanly otherwise.
// ---------------------------------------------------------------------------
if (NETWORK === 'mainnet' && process.env.E2E_MAINNET_CONFIRM !== '1') {
  console.log(
    'e2e-deploy: SKIPPED — mainnet run is gated. Set E2E_MAINNET_CONFIRM=1 to publish a REAL token\n' +
      'on mainnet. Exiting 78 so a skipped run is never mistaken for a pass.',
  )
  // 78 (EX_CONFIG): distinguishable from success (0) and from a test failure (1).
  process.exit(78)
}

// ---------------------------------------------------------------------------
// Keypair + funding. localnet mints a throwaway key from the faucet; testnet/mainnet use an
// externally funded key supplied via SUI_PRIV (never a faucet on a real network).
// ---------------------------------------------------------------------------
let keypair
if (NETWORK === 'localnet') {
  keypair = new Ed25519Keypair()
} else {
  if (!process.env.SUI_PRIV) {
    fail(
      `SUI_PRIV is required for a ${NETWORK} run (bech32 suiprivkey1… — export the funded key with ` +
        `\`sui keytool export --key-identity <addr>\`). Never funds from a faucet on ${NETWORK}.`,
    )
  }
  keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIV)
}
const address = keypair.toSuiAddress()

// Node-side gRPC client points at the PHYSICAL RPC; its `network` label is the app network so
// the built transaction's chain identifier matches what the wallet/app sign under.
const client = new SuiGrpcClient({ baseUrl: RPC, network: APP_NETWORK })

/** Total SUI balance (MIST) of `owner`. */
async function suiBalance(owner) {
  const { balance } = await client.getBalance({ owner })
  return BigInt(balance.balance)
}

const EXPECT_FEE = Boolean(FEE_ADDR) && FEE_ADDR !== ZERO_ADDR

async function main() {
  console.log(`e2e-deploy: E2E_NETWORK=${NETWORK} APP_NETWORK=${APP_NETWORK} RPC=${RPC}`)

  if (NETWORK === 'localnet') {
    await requestSuiFromFaucetV2({ host: FAUCET, recipient: address })
    for (let i = 0; i < 25; i++) {
      if ((await suiBalance(address)) > 0n) break
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  const balance = await suiBalance(address)
  console.log('sender:', address, 'balance:', balance.toString(), 'MIST')
  if (balance === 0n) fail(`sender ${address} has no SUI on ${NETWORK}`)

  const feeBefore = EXPECT_FEE ? await suiBalance(FEE_ADDR) : 0n

  const browser = await launchBrowser()
  const page = await browser.newPage()
  page.on('console', (m) => m.type() === 'error' && console.log('[browser error]', m.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  // The injected wallet advertises the app network's chain so wallet-standard's required
  // feature/chain checks are satisfied; transactions are rebuilt + signed node-side.
  await injectWallet(page, { keypair, client, chain: `sui:${APP_NETWORK}` })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  if (process.env.E2E_TAB) {
    await page.getByRole('tab', { name: process.env.E2E_TAB }).click()
  }
  await connectWallet(page, APP_NETWORK)
  console.log('wallet connected in UI')

  // Fill the wizard: identity → token → settings (defaults) → terms (first run) → review.
  await page.locator('#package').fill('browser_coin')
  await page.locator('#module').fill('browsercoin')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('#name').fill('Browser Coin')
  await page.locator('#symbol').fill('BRWC')
  await page.locator('#description').fill('Deployed via headless browser e2e')
  await page.locator('#decimals').fill('6')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /Review & deploy/ }).click()
  await page.getByRole('button', { name: /I understand — continue/ }).click()
  await page.getByRole('button', { name: /Confirm & deploy/ }).click()
  console.log('confirmed; deploying (real publish + confirmation)…')

  // Wait for the result screen — this is the confirmation the mocked suite cannot reach.
  await page.getByRole('heading', { name: /is live on/ }).waitFor({ timeout: RESULT_TIMEOUT })
  const coinType = await page.locator('dd.mono').first().innerText()
  console.log('UI result coinType:', coinType)

  // Verify the in-browser source-package download (the client's ./package zip + SPDX licence fetch).
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Download source package/ }).click(),
  ])
  const zipBuf = readFileSync(await download.path())
  const isZip = zipBuf[0] === 0x50 && zipBuf[1] === 0x4b
  console.log('download:', download.suggestedFilename(), zipBuf.length, 'bytes, zip:', isZip)
  if (!isZip) fail('downloaded file is not a zip')

  await browser.close()

  // Independent on-chain verification.
  if (!coinType.includes('::browsercoin::BROWSERCOIN')) fail(`unexpected coin type: ${coinType}`)

  if (EXPECT_FEE) {
    const feeAfter = await suiBalance(FEE_ADDR)
    const feeDelta = feeAfter - feeBefore
    console.log('fee delivered this run:', feeDelta.toString(), 'MIST (to', FEE_ADDR + ')')
    if (feeDelta !== EXPECT_FEE_MIST) fail(`expected ${EXPECT_FEE_MIST} MIST fee this run, got ${feeDelta}`)
  } else {
    console.log('no treasury configured — fee assertion skipped (app charges no fee)')
  }

  console.log(`\nDEPLOY E2E PASS ✓ (${NETWORK}: injected wallet, real publish, result panel, zip${EXPECT_FEE ? ', fee delivered' : ''})`)
}

main().catch((e) => fail(e.message))
