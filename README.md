# @meddleware/token-deployer-ui

A browser front-end that lets anyone deploy their own Sui coin — a client-side
equivalent of `blockchain/sui/sui-token-template`. **Everything runs in the
browser**: the user's wallet signs and pays gas, and nothing is compiled or
signed on a server. The user also gets the full, verifiable Move source package,
and can optionally push it to a new GitHub repo in their own account.

## How it works

1. Ships one pre-compiled `sui_token_template` Move module whose metadata fields
   are DISTINCT named constants, so they can be patched
   ([src/move-template/](src/move-template/)).
2. In the browser, [`@mysten/move-bytecode-template`](https://www.npmjs.com/package/@mysten/move-bytecode-template)
   deserialises the module; the identifiers + constant pool are patched to the
   user's values ([src/lib/template.ts](src/lib/template.ts)) and it is re-serialised.
3. A publish PTB ([src/lib/buildPublishTx.ts](src/lib/buildPublishTx.ts)) publishes
   the module, applies the UpgradeCap policy, and splits a trivial fee to the
   operator treasury. A follow-up finalize PTB mints the initial supply and applies
   the supply/metadata policies when they differ from the defaults.
4. The same inputs generate a full, downloadable source package
   ([src/lib/generatePackage.ts](src/lib/generatePackage.ts)) that is **byte-identical**
   to the CLI generator's output, so the on-chain package is source-verifiable.
5. Licenses are fetched live from SPDX ([src/lib/licenses.ts](src/lib/licenses.ts)); an
   optional icon upload goes to Walrus ([src/lib/walrus.ts](src/lib/walrus.ts)); and an
   optional GitHub push uses the user's own token ([src/lib/github.ts](src/lib/github.ts)).

## Security & trust model

- **No backend, no key custody.** The only network calls are to the Sui RPC, the
  user's wallet, SPDX (`raw.githubusercontent.com`), the Walrus relay/aggregator
  (only if the icon uploader is used), and GitHub (only if the push is used).
- **No endorsement.** The tool is neutral; it does not vet or endorse created
  tokens or their creators. This is stated in the review, result, and footer UI.
- **Defence in depth.** User input is validated at the form
  ([src/lib/validation.ts](src/lib/validation.ts)) *and* re-asserted before it is
  substituted into Move source / shell scripts
  ([src/lib/generatePackage.ts](src/lib/generatePackage.ts)) and before it is
  patched into the bytecode ([src/lib/template.ts](src/lib/template.ts)), so no
  quote/backslash/control character or reserved Move keyword can ever produce an
  injectable package.
- **Fee integrity.** The fee is split from the user's own gas coin to the operator
  treasury inside the publish PTB and cannot be redirected at runtime. A production
  build **fails** if the treasury is unset (see below), so revenue can't silently
  burn to `0x0`.
- **GitHub token hygiene.** The optional PAT is `type=password`, `autocomplete=off`,
  sent only to `api.github.com` over HTTPS, never stored or logged, and cleared as
  soon as the push finishes.

## Develop

```bash
npm install
npm run dev          # Vite dev server
npm run test         # Vitest unit tests (61 tests)
npm run type-check   # vue-tsc
npm run build        # production bundle -> dist/ (runs the treasury guard)
npm run docs         # TypeDoc API reference -> docs/api/
```

## Operator configuration

Committed defaults live in [.env.production](.env.production) (build) and
[.env.development](.env.development) (dev server). Override per environment in the
host dashboard. See [.env.example](.env.example) for the full list.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_FEE_TREASURY_TESTNET` / `_MAINNET` | Operator treasury that receives the fee. **A production build fails if either is the zero address** (bypass with `VITE_ALLOW_UNSET_TREASURY=1`). | committed operator address |
| `VITE_FEE_MIST` | Flat fee split from the user's gas coin. | `1000000000` (1 SUI) |
| `VITE_RPC_TESTNET` / `_MAINNET` | JSON-RPC endpoint (set a paid RPC for production). | public endpoints |
| `VITE_PUBLISH_GAS_BUDGET` | Publish gas budget (MIST). | `500000000` |
| `VITE_PUBLIC_URL` | Site origin for canonical/OG/JSON-LD URLs. | `https://tokens.meddleware.co.uk` |
| `VITE_WALRUS_RELAY_TESTNET` / `_MAINNET` | Your own upload relay (to collect the tip). Unset → public Mysten relay (earns nothing). | public relay |
| `VITE_WALRUS_MAX_TIP_MIST` | Client-side max relay tip. **Must exceed your relay's tip** or uploads fail. | `50000000` (0.05 SUI) |
| `VITE_ICON_MAX_BYTES` / `VITE_ICON_ALLOWED_TYPES` | Client icon size/type gate (UX only). | `102400` / PNG,JPEG,WebP,SVG |

## Walrus icon upload relay (optional — for per-upload revenue)

Icon uploads go through a Walrus **upload relay**. Using the public Mysten relay
works out of the box but earns you nothing. To charge users per upload, run your
own relay and configure `VITE_WALRUS_RELAY_*` — the tip is paid **on-chain by the
user's wallet to your address**, no custom backend.

**How the tip is safe (walrus SDK 1.1.7 + `crates/walrus-upload-relay`):** the tip
is baked into the same tx the user signs and bound to the blob by
`blobDigest ‖ SHA256(nonce) ‖ size`. The relay verifies the on-chain payment —
amount checked against the *actual received body length* — **before** the expensive
fan-out. A user cannot strip the tip or underpay for a large blob; either way the
relay rejects and you incur no fan-out cost. The relay performs **no on-chain tx**,
so you never pay gas; storage (WAL) is paid by the user at registration.

**Host it (not a Cloudflare Worker).** The relay RS2-encodes blobs and opens
hundreds of concurrent connections to storage nodes — beyond the Workers model. Run
the stock `mysten/walrus-upload-relay` Docker image on a container host (Fly.io with
scale-to-zero bounds idle cost; or a small VPS + Caddy). Your frontend stays static
(GitHub Pages / Cloudflare Pages); the relay is a separate backend.

```bash
docker run -p 3000:3000 \
  -v $HOME/.config/walrus/walrus_upload_relay_config.yaml:/opt/walrus/walrus_upload_relay_config.yaml \
  -v $HOME/.config/walrus/client_config.yaml:/opt/walrus/client_config.yaml \
  mysten/walrus-upload-relay --context testnet \
    --walrus-config /opt/walrus/client_config.yaml \
    --server-address 0.0.0.0:3000 \
    --relay-config /opt/walrus/walrus_upload_relay_config.yaml
```

**Set a `linear` tip with margin** in `walrus_upload_relay_config.yaml`: `base` ≥
per-request overhead (RPC + connection) and `encoded_size_mul_per_kib` above your
egress cost/KiB, plus a fat margin (it also absorbs SUI/fiat drift and storage-node
retry amplification). Tip `address` = your wallet. Keep `VITE_WALRUS_MAX_TIP_MIST`
comfortably above this tip (the SDK hard-fails uploads if the tip exceeds it). The
relay reads its tip only at **startup**, so changing it means rewrite-YAML + restart.

**Protect it at the edge (the authoritative controls).** Put the relay behind
Cloudflare (proxied DNS) with:

- a **hard request-body cap ~256 KB** — icons are <100 KB, but the relay otherwise
  buffers up to a hardcoded **1 GiB** body into RAM *before* the tip check (the one
  real abuse vector: ingress/RAM/RPC on rejected uploads; no egress/gas);
- a **per-IP** WAF rate-limit on `/v1/blob-upload-relay` (per-*wallet* limiting isn't
  worth it — see [CLAUDE.md](CLAUDE.md) "Walrus relay economics & deferred decisions");
- **origin locked to Cloudflare** (Authenticated Origin Pulls or a Cloudflare Tunnel)
  so the origin IP can't be hit directly.

Open CORS means anyone can use your relay, but every served upload paid a size-scaled
tip, so third-party use is *profitable* as long as the tip keeps margin.

## Deploy (Cloudflare Pages)

- Build command: `npm run build` · Output directory: `dist`
- [public/_headers](public/_headers) sets security headers + asset caching;
  [public/_redirects](public/_redirects) provides the SPA fallback.
- SEO: [index.html](index.html) has env-aware canonical/OG/Twitter/JSON-LD, a real
  `public/og-image.png` (regenerate with `npm run gen:og-image`), and a crawlable
  static fallback; `public/robots.txt` + `public/sitemap.xml` are included.
- Before going live, confirm the treasury vars are set (the build enforces this)
  and point the subdomain at the deployment.

## Keeping the template in sync (single source of truth)

The shipped bytecode and the downloadable source both derive from
`@meddleware/sui-token-template` (`optionalDependencies`). After changing that template, re-run:

```bash
npm run regen:template   # recompiles + refreshes src/move-template/*
npm run sync:template    # refreshes src/template-src/files.json
npm run verify:template  # bytecode round-trip + provenance/parity tests
```

Two tests enforce this invariant in CI so it can never silently drift:

- [tests/templateParity.test.ts](tests/templateParity.test.ts) — `files.json`
  matches the canonical template sources verbatim.
- [tests/templateArtifact.test.ts](tests/templateArtifact.test.ts) — the shipped
  `.mv` still contains the identifiers/constants the patcher expects.

## Verification scripts

- `scripts/publish-localnet.mjs` — patch → publish → finalize against a local Sui node
  (node, no browser).
- `scripts/e2e-deploy.mjs` — the **network-parametrized real-chain deploy e2e** (headless
  browser + injected wallet): drives the full UI, does a REAL publish, waits for real
  confirmation, checks the result panel, downloads the source zip, and verifies coin type +
  operator fee on-chain. Covers exactly what the mocked Cypress suite cannot. `scripts/e2e-browser.mjs`
  is a thin localnet wrapper over it.
- `scripts/e2e-walrus-browser.mjs` — the Walrus icon uploader end-to-end on testnet
  with an injected wallet.

## Real-chain e2e / launch runbook

The Playwright mocked suite (`npm run test:e2e`) mocks all RPC via `VITE_E2E=1`, so it can prove
the form/wallet/publish UI but **not** on-chain confirmation, the result panel, or the source
download. The real-chain harness fills that gap. It is **manual** — never wired into automatic CI — because testnet/mainnet runs
publish a real token and spend real SUI.

```bash
npm run e2e:localnet   # fresh keypair, localnet faucet — no real funds; run this freely
npm run e2e:testnet    # real testnet publish — needs a funded key (see below)
npm run e2e:mainnet     # real mainnet publish — additionally needs E2E_MAINNET_CONFIRM=1
```

Each script builds the app (production build, so the treasury guard runs) and serves `dist` before
driving it. `E2E_NETWORK` selects the chain; the runner derives the app network (localnet borrows
testnet mode with the RPC pointed at the local node).

**Prerequisites for a real (testnet/mainnet) run:**

| Env | Purpose |
| --- | --- |
| `SUI_PRIV` | bech32 `suiprivkey1…` for a **funded** deployer key. Export the CLI key: `sui keytool export --key-identity <addr>`. Never faucet-funded on a real network. |
| `VITE_FEE_TREASURY_TESTNET` / `_MAINNET` | Operator treasury baked into the build (already set in `.env.production`). The build fails if it is the zero address. |
| `E2E_FEE_ADDR` | The treasury to watch for the fee-delta assertion — set it equal to the built treasury. If unset, the fee check is skipped (the app still charges the fee). |
| `VITE_RPC_TESTNET` / `_MAINNET` and `E2E_RPC` | JSON-RPC endpoint for the build (browser) and the node-side verifier. Use a JSON-RPC-capable endpoint — the official testnet fullnode is gRPC-only. |
| `E2E_MAINNET_CONFIRM=1` | **Mainnet only.** Without it the mainnet runner aborts cleanly (fail-safe default) so it can never publish by accident. |

A full fee-charging run needs the key to hold **≥ gas + fee** (~0.5 SUI gas + 1 SUI fee = ~1.5 SUI).
For a first dry run you can lower `VITE_FEE_MIST` or leave the treasury unset (`VITE_ALLOW_UNSET_TREASURY=1`)
so only ~0.5 SUI of gas is needed.

Example (testnet):

```bash
export SUI_PRIV="$(sui keytool export --key-identity 0xYOURADDR --json | jq -r .exportedPrivateKey)"
VITE_RPC_TESTNET=https://sui-testnet-rpc.publicnode.com \
E2E_RPC=https://sui-testnet-rpc.publicnode.com \
VITE_FEE_TREASURY_TESTNET=0xYOURTREASURY \
E2E_FEE_ADDR=0xYOURTREASURY \
npm run e2e:testnet
```

> **Do not run `e2e:testnet` until all other launch work is complete** — a premature published token
> can attract traders before you are ready.

### MVP manual verification checklist

The human backstop for anything the harness does not assert (run once against testnet before launch):

- [ ] Connect a real wallet (testnet), confirm the network selector shows testnet.
- [ ] Fill the form; the coin-type preview updates as the module name changes.
- [ ] Review → Confirm & deploy; wallet prompts to sign and pay gas.
- [ ] "Confirming on-chain" reaches **done** (no timeout).
- [ ] Result panel shows the correct coin type, package id, and cap ids.
- [ ] The SuiScan package link opens the deployed package.
- [ ] "Download source package (.zip)" produces a buildable Move package.
- [ ] "Deploy another" resets the form.
- [ ] (If used) the icon upload returns a Walrus aggregator URL that renders the image.
- [ ] The operator treasury received the fee.

## API reference

`npm run docs` generates a TypeDoc site under `docs/api/` covering the deployment
library (`src/lib`), composables, and config. See [typedoc.json](typedoc.json).
