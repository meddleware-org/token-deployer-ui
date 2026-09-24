// Thin wrapper: localnet deploy e2e. The real implementation is the network-parametrized
// `e2e-deploy.mjs`; this just pins E2E_NETWORK=localnet so the historical entry point and its
// localnet defaults (fresh keypair + faucet, 0xfee… treasury, 1 SUI fee assertion) keep working.
//
// Prereq (as before): build the app with the testnet RPC pointed at the local node and a
// treasury set, then serve dist on APP_URL (default http://localhost:4173):
//   VITE_RPC_TESTNET=http://127.0.0.1:9000 VITE_FEE_TREASURY_TESTNET=<addr> vite build
//
// Equivalent to `E2E_NETWORK=localnet node scripts/e2e-deploy.mjs` — or just `npm run e2e:localnet`.

process.env.E2E_NETWORK = 'localnet'
// Preserve the legacy FEE_ADDR override name for anyone still setting it.
if (process.env.FEE_ADDR && !process.env.E2E_FEE_ADDR) process.env.E2E_FEE_ADDR = process.env.FEE_ADDR

await import('./e2e-deploy.mjs')
