import { expect, test, type Page } from '@playwright/test'

// Mocked-RPC UI e2e against the `e2e` build (`npm run build:e2e`): src/main.ts registers the
// "Test Wallet" mock wallet and a stub Sui client whose publish succeeds with a fixed
// `mytoken::MYTOKEN` coin type. Real confirmation, downloads and on-chain checks live in the
// real-chain harness (scripts/e2e-deploy.mjs).

const WALLET = 'Test Wallet'

async function connect(page: Page, network?: 'testnet' | 'mainnet'): Promise<void> {
  await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click()
  if (network) await page.locator('#dialog-network-select').selectOption(network)
  await page.getByRole('button', { name: WALLET }).click()
  await expect(page.getByText(`${WALLET} ·`)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('connects and disconnects the wallet', async ({ page }) => {
  await expect(page.getByText('Connect a Sui wallet to deploy your token.')).toBeVisible()
  await connect(page)
  await expect(page.locator('#package')).toBeVisible()

  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByRole('button', { name: 'Connect Wallet', exact: true })).toBeVisible()
  await expect(page.locator('#package')).toBeHidden()
})

test('shows the no-wallet notice when no wallet is registered', async ({ page }) => {
  await page.evaluate(() => (window as unknown as { __unregisterMockWallet: () => void }).__unregisterMockWallet())
  const walletBar = page.getByRole('region', { name: 'Wallet and network' })
  await expect(walletBar.getByText('No Sui wallet detected.')).toBeVisible()

  await page.evaluate(() => (window as unknown as { __registerMockWallet: () => void }).__registerMockWallet())
  await expect(page.getByRole('button', { name: 'Connect Wallet', exact: true })).toBeVisible()
})

test('uses the network chosen in the connect dialog', async ({ page }) => {
  await connect(page, 'mainnet')
  const walletBar = page.getByRole('region', { name: 'Wallet and network' })
  await expect(walletBar.getByRole('combobox')).toHaveValue('mainnet')
})

test('validates the identity step before allowing Next', async ({ page }) => {
  await connect(page)
  const next = page.getByRole('button', { name: 'Next', exact: true })

  await page.locator('#package').fill('Bad Name!')
  await page.locator('#package').blur()
  await expect(page.locator('#package')).toHaveAttribute('aria-invalid', 'true')
  await expect(next).toBeDisabled()

  await page.locator('#package').fill('my_token')
  await page.locator('#module').fill('mytoken')
  await page.locator('#module').blur()
  await expect(next).toBeEnabled()
})

test('walks the wizard to a (mocked) successful deploy', async ({ page }) => {
  await connect(page)

  await page.locator('#package').fill('my_token')
  await page.locator('#module').fill('mytoken')
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await page.locator('#name').fill('My Token')
  await page.locator('#symbol').fill('MYT')
  await page.locator('#description').fill('Mocked e2e deploy')
  await page.locator('#decimals').fill('6')
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await page.getByRole('button', { name: /Review & deploy/ }).click()
  await page.getByRole('button', { name: /I understand — continue/ }).click()
  await expect(page.getByRole('heading', { name: /Review — deploying to testnet/ })).toBeVisible()

  await page.getByRole('button', { name: /Confirm & deploy/ }).click()
  await expect(page.getByRole('heading', { name: /MYT is live on testnet/ })).toBeVisible()
  await expect(page.getByText(/::mytoken::MYTOKEN/).first()).toBeVisible()
})
