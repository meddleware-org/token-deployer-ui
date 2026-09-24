# CLAUDE.md — `token-deployer-ui`

`@meddleware/token-deployer-ui` is a Vue 3 + Vite browser app that lets any user deploy
their own Sui coin fully client-side (their wallet signs + pays gas + a trivial fee to
the operator treasury) and download a matching source package. It is the browser
equivalent of the `@meddleware/sui-token-template` Move package (from which it derives
its pre-compiled bytecode and source templates). See the repo-root
[CLAUDE.md](../../../../CLAUDE.md) for context and [README.md](README.md) for the
user/operator guide.

## Dual app + library pattern

This package ships as both a **standalone SPA** and an **embeddable library component**:

- **Standalone SPA** (`npm run dev` / `npm run build`): `src/main.ts` mounts `App.vue`, which
  is a thin shell that renders `WalletBar` + `TokenDeployerView`. All deploy logic lives in
  `TokenDeployerView` — `App.vue` contains no state.
- **Library component** (consumed by `@meddleware/dashboard`): `src/index.ts` exports
  `TokenDeployerView`, which is imported via the `exports["."]` entry in `package.json`. The
  dashboard's Vite build resolves TypeScript source directly — no separate lib build step.
  The dashboard supplies the wallet connection via `@meddleware/wallet-adapter`'s shared
  module singleton; `TokenDeployerView` reads `useWallet()` / `useNetwork()` from it and is
  wrapped in `WalletGuard` so it shows a connect prompt when no wallet is connected.

The pattern mirrors `@meddleware/walrus-ui`, `@meddleware/seal-ui`, and
`@meddleware/access-gate-ui`. See the dashboard `CLAUDE.md` for the invariant: every tool view
must **not** render its own wallet bar, header, or footer when embedded.

**Deploy executor note:** The wallet-adapter `Executor` only returns `{ digest }` — insufficient
for the deploy flow, which requires `objectChanges` to extract the packageId, coin type,
TreasuryCap, and MetadataCap. `src/lib/deployExecutor.ts` uses the wallet-adapter singleton for
wallet connection state, but builds its own `SuiJsonRpcClient` (`@mysten/sui/jsonRpc`) to execute
with `showEffects + showObjectChanges`. This is intentional — do not replace it with the
wallet-adapter `buildExecutor`.

## Architecture (the money/parity paths matter most)

- **Bytecode patching** — [src/lib/template.ts](src/lib/template.ts) deserialises
  one pre-compiled template module ([src/move-template/](src/move-template/)),
  renames the module/OTW-struct identifiers in place, and overwrites five DISTINCT
  named constants (decimals, symbol, name, description, iconUrl), then re-serialises.
  Binary format v7 cannot be round-tripped by `update_identifiers`/`update_constants`
  ("missing field version"); `deserialize`→mutate JSON→`serialize` is the path.
- **Two-phase publish** — TreasuryCap/MetadataCap are created in `init()` and sent
  to the sender, so they are NOT `tx.publish` results. Publish PTB
  ([src/lib/buildPublishTx.ts](src/lib/buildPublishTx.ts)) = publish + UpgradeCap
  policy + fee split from gas. A finalize PTB (only when needed —
  `needsFinalize`) mints supply and applies supply/metadata policies.
- **Orchestration** — [src/lib/deploy.ts](src/lib/deploy.ts) sequences patch →
  publish → wait → (finalize) via an injectable `Executor` (so it is unit-testable;
  the real one is built from the wallet in
  [src/composables/useWallet.ts](src/composables/useWallet.ts)).
- **Package generation** — [src/lib/generatePackage.ts](src/lib/generatePackage.ts)
  substitutes the same inputs into the canonical template text
  ([src/template-src/files.json](src/template-src/files.json)) and zips it.

## Invariants (do not break)

1. **Bytecode ↔ source parity.** The shipped `.mv` and `files.json` must both derive
   from the same `sui-token-template` commit. Enforced by
   [tests/templateArtifact.test.ts](tests/templateArtifact.test.ts) (defaults present
   in the `.mv`) and [tests/templateParity.test.ts](tests/templateParity.test.ts)
   (`files.json` == canonical sources). After changing the template run
   `npm run regen:template && npm run sync:template && npm run verify:template`.
2. **Injection safety is layered.** `validation.ts` gates the form, but
   `generatePackage.ts` (`assertSafeConfig`) and `template.ts` (`patchVecConstant`)
   re-assert `SAFE_TEXT`/`MOVE_IDENT`/length/keyword rules independently. Never
   remove a downstream guard on the assumption the form already checked.
3. **Fee integrity.** The fee is split from `tx.gas` to the config treasury inside
   the publish PTB. The vite production build fails on a zero-address treasury
   (`assertTreasuryConfigured` in [vite.config.ts](vite.config.ts)).
4. **No backend / no custody / no endorsement.** Keep all financial truth on-chain;
   the app only previews and constructs transactions. Do not add a server dependency.
5. **Lazy heavy deps.** `@mysten/walrus` and `@mysten/move-bytecode-template` (wasm)
   are loaded on demand (dynamic import / `?url`). Keep the shared `ICON_EPOCHS`
   constant in [src/lib/walrus-constants.ts](src/lib/walrus-constants.ts) so the
   eagerly-rendered widget doesn't pull the Walrus chunk into the main bundle.

## Walrus icons

Icons are RAW blobs (not quilts) so `GET /v1/blobs/<id>` renders the exact image;
an upload relay is required from browsers. `ICON_EPOCHS = 53` (Walrus's
`max_epochs_ahead`; a larger single reservation aborts). Longer retention needs
`extendBlobLifetime` (no keeper — operator step). Verified on testnet via
`scripts/e2e-walrus-browser.mjs`.

## Walrus relay economics & deferred decisions

The icon upload can charge users per upload via Walrus's **native relay tip** —
no custom backend. This section records the decisions and their rationale so they
survive independently of any planning doc. (Verified against walrus SDK 1.1.7 and
the relay source `crates/walrus-upload-relay`.)

- **Native `linear` tip is enforced on-chain — chosen for launch.** `register`
  bakes an auth payload `blobDigest ‖ SHA256(nonce) ‖ size` **plus** a tip transfer
  to the operator's address into the *same* tx the user signs. The relay verifies
  that on-chain tip (amount checked against the *actual received body length*, bound
  by nonce/size) **before** the expensive storage-node fan-out. Stripping or lowering
  the tip → the relay rejects the upload; no operator cost. This refutes an earlier
  finding that the tip "could be removed" — it is enforced now.
- **The relay does no on-chain tx** (README L27) → the operator never pays gas.
  Storage (WAL) is paid by the **user** at registration; read/serve bandwidth is the
  separate public **aggregator**. The tip only needs to cover the relay's
  ingress + fan-out egress + RPC lookups.
- **NFT / usage-ticket per-wallet gating is IMPLEMENTED (2026-08-05)** via the standalone
  `nft-gate` project: an `nft-gate` gateway fronts the operator relay and admits only
  holders of an `access_gate` NFT. The app gates the operator-relay option on ownership
  (`useAccessGate` → `getOwnedObjects`), offers a permissionless purchase CTA, and attaches
  a wallet-signed access proof (`sui:signPersonalMessage` → `uploadRelayAuthToken`) when the
  operator relay is used. Unset `VITE_ACCESS_GATE_*` → no gating (unchanged behaviour). The
  tip and the NFT are **independent levers** (tip = per-upload cost; NFT = access/abuse).
- **Per-wallet rate limiting** — previously rejected at the edge (which can't resolve the
  wallet), it is now enforced by the `nft-gate` gateway *after* verification. Keep a per-IP
  edge limit as a coarse pre-auth control.
- **Autonomous price-fed tip tuner DEFERRED** — the relay reads its tip only at
  **startup** (no hot-reload/SIGHUP), so adjusting = rewrite YAML + restart. That's a
  keeper with a liveness dependency. For launch use a **single static tip with a fat
  SUI-denominated margin**: icons are cents-scale, so a large margin costs users
  nothing and absorbs *both* SUI/fiat drift and storage-node retry amplification in
  one lever. A later tuner (read Pyth on-chain, clamp to `[min,max]`, rolling-restart)
  must stay under the client `max` headroom below.
- **Client `WALRUS_MAX_TIP_MIST` ↔ relay-tip COUPLING** — the SDK **throws** if the
  relay's tip exceeds this client ceiling ([config.ts](src/config.ts) documents it).
  Set it with generous headroom above the relay tip; raising the relay tip past it
  needs a frontend redeploy.
- **Client-side icon size/type limits are UX only — NOT security.** The authoritative
  cap is a hard request-body limit at the edge (the relay otherwise buffers up to a
  hardcoded 1 GiB body into RAM *before* the tip check — the one real abuse vector:
  ingress/RAM/RPC on rejected uploads). See the relay runbook in [README.md](README.md).

## Testing

Three distinct categories — do not collapse them (repo convention):

- **Pure unit (Vitest, `npm test`):** validation, licenses, github, template patch, PTB
  builders, generatePackage, deploy orchestration, provenance/parity.
- **Mocked-RPC UI e2e (Playwright, `npm run test:e2e`):** wallet/form/publish flow against the
  `VITE_E2E` fetch mock + mock wallet in [src/main.ts](src/main.ts) (tree-shaken from prod). Specs
  live in `e2e/` (`playwright.config.ts` builds with `VITE_E2E=1` + previews). **Migrated from Cypress
  2026-08-07** (Cypress dropped — it exits SIGILL in the sandbox; Playwright is the one browser-e2e
  tool now, shared with the real-chain harness). Run `npm run e2e:install` once, then `npm run test:e2e`.
  Cannot reach real confirmation, the result panel, or the source download — those need a real chain
  (see below). This is the automatic gate alongside `npm test`.
- **Real-chain deploy e2e (Playwright, NOT in `npm test`):** `scripts/e2e-deploy.mjs` — the
  single network-parametrized harness (`E2E_NETWORK=localnet|testnet|mainnet`) driven by
  `npm run e2e:localnet|e2e:testnet|e2e:mainnet`. Injects a wallet-standard wallet backed by a
  node keypair, does a REAL publish, waits for real confirmation, checks the result panel,
  downloads the zip, and verifies coin type + fee on-chain. Two axes are distinct: `E2E_NETWORK`
  (physical chain) vs the app network (testnet/mainnet UI mode; localnet borrows testnet mode with
  the RPC pointed at the local node). Mainnet is fail-safe: aborts unless `E2E_MAINNET_CONFIRM=1`.
  `scripts/e2e-browser.mjs` is a thin `E2E_NETWORK=localnet` wrapper; `scripts/e2e-walrus-browser.mjs`
  (testnet icon upload) uses the E2E-only `window.__getSuiClient` hook in `src/main.ts`. Testnet/
  mainnet are **manual only** — never in automatic CI (see the README launch runbook). The
  `.github/workflows/token-deployer-e2e.yml` `workflow_dispatch` job is the gated manual runner.

## Docs

TSDoc on every exported symbol in `src/lib`, `src/composables`, and `src/config.ts`;
`npm run docs` renders a TypeDoc site to `docs/api/` (config: [typedoc.json](typedoc.json)).
