# AGENTS.md — token-deployer-ui

Browser app for permissionless Sui token deployment. See [CLAUDE.md](CLAUDE.md) for full architecture and invariant documentation.

## Responsibilities

- Bytecode patching of the pre-compiled Move template (`src/lib/template.ts`)
- PTB construction for two-phase publish + finalize (`src/lib/buildPublishTx.ts`)
- Source package generation and zip download (`src/lib/generatePackage.ts`)
- Walrus icon upload via the operator relay (`@meddleware/sui-walrus`)
- NFT-gate ownership check and access-proof attachment when `VITE_ACCESS_GATE_*` is configured

## Non-responsibilities

- On-chain accounting or financial enforcement — the contracts handle that
- Any backend process; no server dependency
- Custody of keys or user funds

## Testing

Three distinct categories — do not collapse:

1. **Unit tests** (`npm test`, Vitest): validation, template patching, PTB builders, generatePackage, deploy orchestration.
2. **Mocked-RPC e2e** (`npm run test:e2e`, Playwright, Chromium + Firefox): UI flow with fetch mock + mock wallet. Specs live in `integrations/token-deployer/e2e/`.
3. **Real-chain e2e** (`npm run e2e:localnet|testnet|mainnet`): publishes a real token; **never run in automatic CI**; gated by `E2E_MAINNET_CONFIRM=1` on mainnet.

## Key invariants

- **Template parity:** `.mv` bytes and `files.json` must derive from the same `sui-token-template` commit. Verify with `npm run verify:template`; regenerate with `npm run regen:template && npm run sync:template`.
- **Fee integrity:** treasury fee is split from gas inside the publish PTB. The vite prod build fails if `VITE_FEE_TREASURY` is unset (`assertTreasuryConfigured`).
- **Injection safety:** validation in `validation.ts` + independent re-assertion in `generatePackage.ts` and `template.ts`. Never remove a downstream guard.
- **No wallet-standard proxying:** Sui wallet objects must be wrapped in `markRaw()` before storing in Vue reactive state (private-field getters crash under Vue's Proxy).

## Key paths

- E2e specs: `e2e/` (mocked-RPC Playwright suite; `testDir` in `playwright.config.ts`)
- Move template: `@meddleware/sui-token-template` (`optionalDependencies` in `package.json`; local checkout at `../sui-token-template/` if working from the workspace)
- NFT gate client: `@meddleware/nft-gate-client` (`repos/nft-gate-client/` in the workspace)
- CI workflow: `.github/workflows/token-deployer-e2e.yml`
