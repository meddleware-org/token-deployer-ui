# Security Audit — `token-deployer-ui`

**Classification:** Internal security review
**Project:** `repos/token-deployer-ui` — `@meddleware/token-deployer-ui`, Vue 3 SPA + library component for client-side Sui coin deployment
**Project type:** Vue app + UI library (embedded in the dashboard)
**Template:** AUDIT_TEMPLATE.md (2026-10-08) + AUDIT_TEMPLATE_VUE.md (2026-10-08) + AUDIT_TEMPLATE_TS.md (2026-10-08) + AUDIT_TEMPLATE_SUI_CLIENT.md (2026-10-08) + AUDIT_TEMPLATE_WALRUS.md (2026-09-30) + AUDIT_TEMPLATE_IMG.md (2026-10-08) + AUDIT_TEMPLATE_OPS.md (2026-10-08) + AUDIT_TEMPLATE_AUTH.md (2026-10-08)
**Sui SDK:** `@mysten/sui ^2.34.0` (one copy per host; `npm ls` single version 2.34.0); token logic from `@meddleware/sui-token-client ^0.0.10`
**Transport:** gRPC(-web) through wallet-adapter's read client (`src/wallet.ts`); no JSON-RPC
**Networks:** testnet and mainnet in the UI; localnet for development and `e2e:localnet`
**On-chain packages consumed:** the Sui framework (`0x1`, `0x2`) only — the coin package is published by the user; the relay access gate comes from walrus-relay's `relayGateConfig` (`@meddleware/access-gate-client` 0.0.8 deployments, testnet `access_gate` `0xd7ddaa94…88c9`, PlatformConfig `0x3f81489d…e7b5`; both found in the live bundle 2026-10-09) with the gate id `VITE_ACCESS_GATE_ID_TESTNET` (`0x316f1bf9…faddc`, soulbound, 10 uses, 0.01 SUI). The superseded package `0xa55789…` and gate `0xfd6c3b…` do not appear in the live bundle
**Package manager / lockfile:** npm 11, `package-lock.json` committed (also copied into the image for SBOM tools)
**Module format / publish model:** ESM; ships source (`exports["."] → src/index.ts`) for hosts that build it; standalone SPA image
**Runtime targets:** browser
**Peer dependencies:** `@meddleware/wallet-adapter >=0.0.12 <0.2.0` (the host's single copy)
**Auth role(s):** holder of a user-supplied third-party token (the user's own GitHub token, browser memory, one operation); client of the nft-gate access proof (signed by the wallet, built by `nft-gate-client` via `walrus-client`). No issuer, no session, no identity provider
**Images:** `quay.io/meddleware-org/token-deployer-ui:0.0.35@sha256:d9005ca3…749d` (Docker Hub mirror; cosign keyless, SPDX SBOM attestation, build provenance; verified 2026-10-09, `verify-digests.sh` 16/16)
**Base images:** build `node:24-slim@sha256:0e0ff40c…f9b6`; runtime `quay.io/meddleware-org/static-server:0.1.7@sha256:2e227311…2379` (Go 1.26.9)
**Runtime user:** `USER 65534:65534`   **Runtime FS:** read-only root, no writable mounts
**Deployed by:** `post-bootstrap/token-deployer-ui/overlays/default`; digest from `config/images.yaml`
**Build args:** the `VITE_*` public values only (network, treasury, RPC, relay, gate id, tip ceiling, public URL) — none secret, none a test switch
**Deployment status:** npm v0.0.35 (2026-10-09); image `quay.io/meddleware-org/token-deployer-ui` serving `sui-token-deployer.meddleware.co.uk` at 0.0.35 (`sha256:d9005ca3…`, deployed 2026-10-09); embedded in dashboard 0.1.84 (`dash.meddleware.co.uk/blockchain`, "Token Deployer" tab)
**Review date:** 2026-09-24 (first pass) · re-verified 2026-10-02 · re-verified 2026-10-09
**Reviewer:** Internal review
**Severity ceiling:** High — the operator fee is split inside the user's publish transaction, the app patches bytecode the user signs, its icon uploads use the paid, NFT-gated relay, and it can hold the user's GitHub token for one push. It holds no keys and no server.
**Status:** re-verified 2026-10-09

---

## Executive summary

A client-side Sui coin deployer: the wallet signs and pays every transaction; all authority is
on-chain. Since B7 (2026-10-02) the token logic — Move rules, the bytecode patcher, publish and
finalize PTBs, exact-type result parsing, the source package and the token listing — lives in
`@meddleware/sui-token-client` (own audit); this app keeps the wizard, the wallet wiring, the form
messages and the icon upload.

Since the first pass:

- **F15 (High, RESOLVED)** — the gated relay's access proof was passed as a `headers` option that
  `@mysten/walrus` silently drops, so a user who bought a pass still had every upload refused. It
  is now injected through the SDK's `fetch` hook, relay origin only.
- **F16 (Medium, RESOLVED)** — while the operator relay's health check was pending, the free public
  relay was offered, letting an early upload bypass the gated relay.
- **F17 (Medium, RESOLVED, B1)** — the e2e harness (mock wallet, stub client, window hooks) is
  confined to a dedicated build mode, and a production artifact is scanned for it.
- This pass fixed F19 (My Tokens kept another network's list after a switch), F20 (the real-chain
  workflow could hold a mainnet key and ran in an environment that did not exist), F21 (two
  undocumented variables) and **F24 (Medium)**: a refused or failed second signature returned the user
  to the review step, so the natural retry published a second coin and paid the fee again, while the
  first stayed unfinished. The deployer now offers **Finish setup** and never a second deploy after a
  publish.

Re-verified 2026-10-09 (0.0.35, 59 unit tests, 10 Playwright runs, type-check and all three linters
green, `e2e:testnet` PASS 2026-10-09):

- **F26 (Low, RESOLVED)** — the user's GitHub token: the push calls refuse redirects, send no cookies and
  are never cached (0.0.34); tests pin that the token is cleared after success and after failure and is
  never written to browser storage. The AUTH lens (user-supplied third-party tokens) is now carried.
- **F27 (Low, RESOLVED)** — the image release runs the full CI workflow, scans the published image
  (fixable CRITICAL/HIGH fail) before cosign signs it, ships the lockfile for SBOM tools and serves
  `/THIRD_PARTY_LICENSES`; explicit `USER 65534:65534` on static-server 0.1.7 (0.0.34–0.0.35).
- **F28 (Low, RESOLVED)** — fixed-supply and frozen-metadata choices are applied by the coin's own `init`
  (sui-token-client 0.0.9–0.0.10, template 1.0.8), so the registry records them; My Tokens lists
  capability-less coins (0.0.32–0.0.33).
- The relay gate moved to the 2026-10-09 `access_gate` publication (0.0.29); the live bundle carries only
  the new package and gate. The `suiBoundary` lint is adopted (`eslint-config` 0.0.2) and enforced.
- Recorded without a fix: F29 (blanket `https:` in `connect-src`, ACCEPTED-RISK), F30 (npm publish gate is
  a subset of CI, ACCEPTED-RISK), F31 (cosign identity pins the repository, not the workflow, ACCEPTED-RISK),
  F32 (private-registry mirror jobs, DEFERRED to the maintainer), F33 (one allowlisted dev-tool advisory,
  ACCEPTED-RISK), F34 (licence and GitHub fetches have no timeout or size bound, ACCEPTED-RISK; a one-line
  fix for the next release).

Posture: no open finding above Info. Remaining items are maintainer-only or mainnet-gated: the real-chain
environment's reviewer (OQ1), the registry-credential inventory (`OPERATOR_TASKS.md` "Image registry
credentials"), the mainnet treasury confirmation and the external review in Section D.

## Threat model / trust boundaries

| Actor | Can do | Bounded by |
| --- | --- | --- |
| User (wallet) | approve publish + finalize; pay gas, fee and icon storage | wallet preview; the review panel shows network, recipient, fee and fee treasury |
| Operator (build config) | set fee and treasury | `assertTreasuryConfigured` refuses a zero-address production build; values are public |
| Malicious form input | inject into bytecode constants or Move source | `validation.ts` (form) + `assertTokenConfig` in the client before patching, publishing and package generation |
| Upload relay | ask a tip; return a blob id | client tip ceiling (`WALRUS_MAX_TIP_MIST`); the wallet signs register; the aggregator serves the exact bytes |
| Gated relay (nft-gate) | admit or refuse uploads | proof sent only to the relay origin over https (F15); pass purchase and consume are user-signed |
| Read node | report owned objects | display only (My Tokens); deploy results come from the executed transaction's effects |
| Supply chain | ship a malicious wasm / SDK | lockfile, `npm audit`, OIDC provenance, digest-pinned image bases |
| Other dApps sharing the wallet | switch account or network | shared wallet-adapter state; views reload and drop stale results (F19); wallet-adapter 0.0.17 checks the chain id and warns on look-alike wallets |
| GitHub API (optional repo push) | receives the user's own token and the generated package | https origin only, `redirect: 'error'`, no cookies, no cache; token memory-only and cleared (F26) |
| Static host / CDN | headers, served bytes | CSP/HSTS on both paths (B.VUE-1); digest-pinned image, cosign-verified (F27) |

**Primary trust anchor:** the Sui chain and the user's wallet.

### Identity & credential matrix (AUTH lens)

The app issues, verifies and stores no credentials and has no identity provider. It holds two secrets
for the length of one operation each:

| Authority / credential | Holder | What it confers | Misuse / compromise impact | Rotation / revocation plan |
| --- | --- | --- | --- | --- |
| User's GitHub token (fine-grained, or classic `repo`) | the user's browser tab, in memory, for one push | create a repository and push files in the user's account | account access within the granted scopes if the app leaked it | never stored or logged; cleared after success and after failure (F26); the user revokes it at GitHub |
| Wallet-signed relay access proof (`nft-gate:access:v2`) | the browser, for one upload | one gated relay upload for that wallet, audience-bound | replay elsewhere is refused by the audience and single-use consume digest | built by `nft-gate-client` through `walrus-client`; sent to the relay origin only, over https (F15) |
| Wallet keys | the user's wallet | every signature | — | never seen by the app |

### On-chain dependency matrix

| Object / package | ID | Sourced from | Used as | If wrong | Fails |
| --- | --- | --- | --- | --- | --- |
| Sui framework `0x1`, `0x2` | system | client constants | publish dependencies; `coin_registry::finalize_registration`, `coin::mint`, `transfer::public_freeze_object`, `package::make_immutable` | n/a (system); drift checked in sui-token-client's live ABI test | closed |
| `0x2::coin::TreasuryCap<T>` | per deploy | publish effects | result extraction (exact type, own package) | a foreign cap is never taken | closed |
| relay `Gate` | `0x316f1bf9…faddc` (testnet; package `0xd7ddaa94…88c9`, PlatformConfig `0x3f81489d…e7b5`) | `VITE_ACCESS_GATE_ID_TESTNET` + `relayGateConfig` (access-gate-client 0.0.8 `deployments`) | operator-relay access | wrong id → no pass found → no operator relay | closed |

## Severity scale

Critical / High / Medium / Low / Info / Positive.

## Scope

- **In scope (0.0.35):** `src/**` (components, composables, `config.ts`, `wallet.ts`,
  `templateWasm.ts`, `lib/{deployExecutor,validation,form,licenses,github,errors,walrus-constants}.ts`),
  `composables/{useDeploy,useWalrusRelay}.ts`,
  `vite.config.ts`, `public/_headers`, `.env.example` / `.env.production`, `Dockerfile`,
  `.dockerignore`, `scripts/*` (including `third-party-licenses.mjs`), `e2e/*`, `tests/*`,
  `.github/workflows/*` and `.github/{audit-gate.mjs,audit-allowlist.json,dependabot.yml}`, `SECURITY.md`,
  and the deployment manifests under `post-bootstrap/token-deployer-ui/` (read-only).
- **Out of scope:** `@meddleware/sui-token-client`, `walrus-client`, `walrus-relay`,
  `wallet-adapter`, `@mysten/*` (own audits or upstream); the relay, aggregator and RPC.
- **Environment (2026-10-09):** `npm test` 59/59 in 11 files; Playwright mocked suite 10/10 (5 specs ×
  Chromium and Firefox, `build:e2e`); `npm run lint` (stylelint, eslint + vuejs-a11y + `suiBoundary`,
  html-validate) and `type-check` clean; `node .github/audit-gate.mjs` 1 allowlisted advisory (F33);
  `e2e:testnet` PASS 2026-10-09 (real publish, result panel, zip, fee delivered); live bundles and headers of
  `sui-token-deployer.meddleware.co.uk` read with `curl` (read-only). Earlier (2026-10-02): a real localnet
  deploy through the dashboard's production build (`e2e-deploy.mjs` with `E2E_TAB`).

## Findings

### F1 — Fee treasury env wiring

**Severity:** High   **Disposition:** RESOLVED
**Where:** `vite.config.ts` (`assertTreasuryConfigured`), `.env.production`
**Issue / impact:** an unset treasury would send every fee to `0x0`.
**Remediation / evidence:** committed `.env.production` defaults in this repo and the dashboard; a
production build aborts on a zero-address treasury for any selectable network; overrides via
`--build-arg`. Re-verified 2026-10-09: `vite.config.ts` `assertTreasuryConfigured` unchanged, the image has no bypass
argument. Operator action before mainnet: confirm `VITE_FEE_TREASURY_MAINNET` (Section D).

### F2 — Dual wallet singleton when embedded

**Severity:** Medium   **Disposition:** RESOLVED
Both views read `useWallet()` from `@meddleware/wallet-adapter`, now a peer dependency, so the host's
single copy serves every embedded tool.

### F3 — Renamed relay package import

**Severity:** Medium   **Disposition:** RESOLVED — imports `@meddleware/walrus-relay`.

### F4 — No library export

**Severity:** Medium   **Disposition:** RESOLVED — `src/index.ts` exports `TokenDeployerView`;
`exports["."]` in `package.json`; it also configures the template wasm (`templateWasm.ts`), so the
embedded tool deploys (verified in the dashboard build).

### F5 — Two `@mysten/sui` copies in the host

**Severity:** Medium   **Disposition:** RESOLVED — `^2.34.0` everywhere; one copy in the dashboard
(`npm ls`, 2026-10-02) and one in this repo (`npm ls @mysten/sui` → 2.34.0 deduped, 2026-10-09).

### F6 — Wallet disconnected on page load

**Severity:** Info   **Disposition:** ADJUDICATED (product behaviour: no implicit session resume,
consistent across tools).

### F7 — JSON-RPC client path

**Severity:** Medium   **Disposition:** RESOLVED (superseded)
Public full nodes dropped JSON-RPC; every read and execution is gRPC through wallet-adapter
(`src/wallet.ts`), and the `suiBoundary` lint (B8) forbids `@mysten/sui/jsonRpc` in app code.

### F8 — Deploy executor lacked object changes

**Severity:** Medium   **Disposition:** RESOLVED (superseded by B6)
`src/lib/deployExecutor.ts` wraps wallet-adapter's `buildExecutor` (signing, chain check and
account binding are the adapter's) and executes with `include: { effects, objectTypes }`;
`toSuiTxResult` from the client maps the result. Success is the effects status only.

### F9 — Tests referenced deleted composables

**Severity:** Low   **Disposition:** RESOLVED.

### F10 — No always-on CI or CVE scan

**Severity:** Low   **Disposition:** RESOLVED — `node-ci.yml`: `npm audit --audit-level=high`,
type-check, three linters, unit tests, build, `check:bundle`, and the mocked Playwright suite.

### F11 — Icon URL scheme allowlist

**Severity:** Positive — `https://` / `ipfs://` only, enforced in the form and again by the client's
`assertTokenConfig`; no `v-html`.

### F12 — Icon size and type limits framed as UX only

**Severity:** Positive — the authoritative cap is the edge body limit (nft-gate F8).

### F13 — Treasury guard is fail-closed

**Severity:** Positive — the only bypass is `VITE_ALLOW_UNSET_TREASURY=1` (dev / CI builds); the
Dockerfile has no such argument and the e2e mode no longer bypasses it (F17).

### F14 — `base` path

**Severity:** Info   **Disposition:** RESOLVED — `base: "/"` serves the standalone site at its own
host; the library build path is irrelevant to hosts.

### F15 — Gated-relay proof silently dropped

**Severity:** High   **Disposition:** RESOLVED (`1e44270`, 2026-09-30)
**Where:** icon upload through the operator relay (now `@meddleware/walrus-client/flow`)
**Issue:** the access proof was passed as an upload-relay `headers` option; the `@mysten/walrus`
relay options are only `{ host, fetch, timeout, onError }`, so it was dropped.
**Impact:** a user who had bought a pass had every gated upload refused (401) — paid service denied.
**Remediation / evidence:** the proof is attached by `relayAuthFetch` through the `fetch` hook, to
the relay origin only and only over https (walrus-client); the challenge request has a timeout and
validated response (nft-gate-client 0.0.14). Live: `e2e:walrus` with `E2E_RELAY=operator` passed
2026-10-01 (buy, consume, signed proof, register, upload, certify). Since then the proof is audience-bound
(`nft-gate:access:v2`, 0.0.26 `41f97ef`) and the gate is on the 2026-10-09 publication (0.0.29 `b65eed5`); the
operator-relay paywall e2e passed 2026-10-09 against the live dashboard (pass bought on gate `0x316f1bf9…`,
consumed, upload through the Worker).

### F16 — Relay selection could bypass the gated relay

**Severity:** Medium   **Disposition:** RESOLVED (walrus-relay 0.1.21 `6ec53b0`; token-deployer-ui 0.0.15 `6737732`)
**Where:** walrus-relay `useWalrusRelay`; `IconPicker.vue`
**Issue:** while the operator relay's health check was pending, the public relay was offered.
**Impact:** an upload started in the first moments used the free relay, bypassing the gate and the
operator tip.
**Remediation / evidence:** no relay is offered until the check answers; while the operator relay
is up it is the only option; uploads are blocked until a relay is available. Tests in walrus-relay
(`useWalrusRelay.test.ts`).

### F17 — E2E harness could reach a production build

**Severity:** Medium   **Disposition:** RESOLVED (B1, `8e540d5`)
**Where:** `src/main.ts`, `vite.config.ts`, `scripts/check-prod-bundle.mjs`, `Dockerfile`, `.dockerignore`
**Issue:** the mock wallet, stub client, window hooks and fabricated digest were gated by
`VITE_E2E` alone, which also bypassed the treasury guard.
**Impact:** a misconfigured build could ship a fake wallet and a fee-less deploy.
**Remediation / evidence:** the harness compiles only when `MODE === 'e2e' && VITE_E2E === '1'`;
`vite.config.ts` throws if `VITE_E2E=1` in any other mode; `check:bundle` scans the production
`dist/` in CI and in the Dockerfile; `.dockerignore` excludes `.env.e2e` and local env files.

### F18 — Token logic duplicated in the app (B7)

**Severity:** Low   **Disposition:** RESOLVED (0.0.17, `083ee47`)
**Where:** formerly `src/lib/{buildPublishTx,deploy,template,generatePackage,listMyTokens}.ts`
**Issue:** result parsing used substring and suffix matches, a missing effects status passed as
success, and blob thumbnails and explorer links bound raw URLs.
**Impact:** a look-alike type could be taken as the published coin; a failed publish could look
successful.
**Remediation / evidence:** the logic moved to `@meddleware/sui-token-client` (exact, own-package
type matching; effects status required); blob thumbnails use `safeHref`; My Tokens builds explorer
links with `suiExplorerUrl` behind its network check.

### F19 — My Tokens kept the wrong network's list

**Severity:** Low   **Disposition:** RESOLVED (0.0.20, `8ace3be`)
**Where:** `src/components/MyTokens.vue`
**Issue:** the list reloaded on an account change but not on a network change, and a slow
response for the previous account could overwrite the new one.
**Impact:** coins of one network or account shown under another (display only).
**Remediation / evidence:** reloads on account or network change; results of superseded loads are
dropped; disconnect clears the list. Tests: `tests/myTokens.test.ts` (3).

### F20 — Real-chain CI could hold a mainnet key; its environment did not exist

**Severity:** Low   **Disposition:** RESOLVED (`77d6353`; `realchain` environment created 2026-10-02)
**Where:** `.github/workflows/e2e-realchain.yml`
**Issue:** the workflow offered mainnet with a `SUI_PRIV_MAINNET` secret (OPS-M7 forbids mainnet keys
in CI), and the `realchain` environment it names did not exist, so the first run would have created
it unprotected.
**Impact:** none yet (no secrets set); a future mainnet key in CI would be exposed to the workflow.
**Remediation / evidence:** the workflow is testnet-only; mainnet runs are local
(`E2E_MAINNET_CONFIRM=1 npm run e2e:mainnet`); `realchain` created with deployments limited to
`main`. Re-verified 2026-10-09: `e2e-realchain.yml` is `workflow_dispatch` only, testnet only, SHA-pinned
actions, `permissions: contents: read`; `e2e-deploy.mjs` exits 78 for an unconfirmed mainnet run. A required
reviewer is OQ1 (maintainer decision).

### F21 — Undocumented build variables

**Severity:** Info   **Disposition:** RESOLVED (`4a0ea2f`)
`VITE_RPC_LOCALNET` and `VITE_FEE_TREASURY_LOCALNET` are now in `.env.example`; the stale GitHub
Pages mirror line is gone.

### F22 — The standalone site uses the gated relay (D21)

**Severity:** Positive — `sui-token-deployer.` is in the gateway's `ALLOWED_ORIGINS` and its image is
built with the `VITE_ACCESS_GATE_*_TESTNET` and `VITE_WALRUS_RELAY_TESTNET` arguments, so icon uploads
go through the same paid relay as walrus-ui and the dashboard.

### F23 — `sideEffects` not declared

**Severity:** Info   **Disposition:** ADJUDICATED — the library entry imports `templateWasm.ts` for its
side effect (wasm set-up) and component CSS; the default (everything may have side effects) is the
accurate declaration.

### F24 — Retrying after a failed second signature published a second coin

**Severity:** Medium   **Disposition:** RESOLVED (0.0.23, `27cedae`; sui-token-client 0.0.4–0.0.5)
**Where:** `src/components/TokenDeployerView.vue`, `src/composables/useDeploy.ts`
**Issue:** any deploy error returned to the review step, including errors after the publish had
executed (finalize refused or failed, publish not confirmed).
**Impact:** the user's natural next click published a second coin and paid the fee again; the first
coin stayed unfinished (no registered currency, no supply, fixed-supply / frozen-metadata choices not
applied).
**Remediation / evidence:** `useDeploy` routes on the client's typed errors (sui-token-client F8):
`DeployIncompleteError` → an **incomplete** step that explains the state and offers **Finish setup
(sign again)** (`finalizeToken` on the network the coin was published to); a plain `PublishedError`
→ the publish digest, no deploy or retry; `DeployUnconfirmedError` → the result with a warning.
Only a failure before the publish returns to the review. Tests: `tests/useDeploy.test.ts` (5);
mocked Playwright 10/10; real localnet browser deploy passed.

### F25 — Blocked browser storage broke the terms step and gated uploads

**Severity:** Low   **Disposition:** RESOLVED (0.0.24, `946fb28`)
**Where:** `src/components/TokenDeployerView.vue`, `src/components/IconPicker.vue`
**Issue / impact:** the terms flag was read from `localStorage` at mount and the gated upload passed
`window.localStorage`; with site data blocked both throw, so the deployer did not render and gated
icon uploads failed.
**Remediation / evidence:** both use walrus-client's `browserStorage()` (0.0.24), which falls back to
memory; the terms are simply asked again next visit. Playwright 10/10.

### F26 — The user's GitHub token: redirects, cookies and caching

**Severity:** Low   **Disposition:** RESOLVED (0.0.34, `7430ee9`)
**Where:** `src/lib/github.ts` (`SENSITIVE_FETCH`), `src/components/GithubPush.vue`
**Issue:** the optional repository push sent the user's own GitHub token with fetch defaults, so a redirect
would have been followed and the request could carry cookies or be cached. The token was already
https-only, kept in a `type=password` field, and cleared in a `finally` block.
**Impact:** a GitHub-side redirect or an intermediary cache could have received the token-bearing request;
low, because browsers drop `Authorization` on cross-origin redirects and the origin is fixed.
**Remediation / evidence:** every GitHub call passes `redirect: 'error'`, `credentials: 'omit'` and
`cache: 'no-store'`; a non-https `apiBase` is refused before anything is sent; the field is
`autocomplete="new-password"`, `spellcheck="false"`; the hint names the scopes and says the token is never
stored. Tests: `tests/github.test.ts` (fetch options on every call, https refusal, Bearer header) and
`tests/githubPush.test.ts` (5: password field, scope hint, token cleared after success and after failure,
error text never contains it, `Storage.prototype.setItem` never receives it).

### F27 — Image release gate, scan and notices

**Severity:** Low   **Disposition:** RESOLVED (0.0.34 `7430ee9`, 0.0.35 `72046c3`)
**Where:** `.github/workflows/docker-publish.yml`, `Dockerfile`, `scripts/third-party-licenses.mjs`
**Issue:** the image release was gated by a subset of CI (audit, type-check, unit tests), the published image was not
scanned before signing, the lockfile was not in the image (the SBOM saw only the base), and no third-party
licence texts were served with the bundled npm code.
**Impact:** a tag could ship what CI would have refused; an SBOM that misses the bundled dependencies;
redistributed MIT/Apache code without its notices.
**Remediation / evidence:** `verify` calls `node-ci.yml` (`workflow_call`) and every build job `needs`
it; the merge job runs Trivy on the pushed digest (CRITICAL/HIGH, fixable only, `exit-code: 1`) before
`cosign sign`, then the SPDX SBOM attestation and provenance for quay.io and Docker Hub; the Dockerfile
copies `package-lock.json` to `/usr/share/doc/token-deployer-ui/` and generates
`THIRD_PARTY_LICENSES` (served; HTTP 200 on the live site 2026-10-09; CI runs `check:licenses`); the runtime
base is static-server 0.1.7 (Go 1.26.9) with an explicit `USER 65534:65534`; the pod sets
`automountServiceAccountToken: false`, `runAsNonRoot`, read-only root, all capabilities dropped,
`RuntimeDefault` seccomp, probes and limits.

### F28 — Supply and metadata policies recorded by the coin's own `init`

**Severity:** Low   **Disposition:** RESOLVED (0.0.32 `fac22f2`, 0.0.33 `26e9dc2`; sui-token-client 0.0.9–0.0.10, sui-token-template 1.0.8)
**Where:** `src/components/ConfigForm.vue`, `src/lib/validation.ts`, `src/components/MyTokens.vue`
**Issue:** a fixed supply and frozen metadata were applied by the finalize transaction, so the coin
registry did not record them and a capability could outlive the choice.
**Impact:** the on-chain record disagreed with what the user selected.
**Remediation / evidence:** the client patches `INITIAL_SUPPLY`, `FIXED_SUPPLY` and `FROZEN_METADATA` into the
template, so `init` calls `make_supply_fixed` and `finalize_and_delete_metadata_cap` and the registry records
a fixed supply and a deleted MetadataCap. The form explains this, requires a supply above zero for a fixed
supply, and the result shows no TreasuryCap/MetadataCap for them. My Tokens also lists capability-less coins
and shows the MetadataCap. Verified by the client's `e2e:localnet` (fixed-supply + frozen-metadata coin,
2026-10-09) and this app's `e2e:testnet` PASS 2026-10-09.

### F29 — `connect-src` allows any https origin

**Severity:** Info   **Disposition:** ACCEPTED-RISK
**Where:** `Dockerfile` (`CSP` argument), `public/_headers`; live header read 2026-10-09
**Issue:** `connect-src 'self' https:` (and `img-src … https:`) is a blanket allowance.
**Impact:** an injected script could send data to any https host. Script injection is the prerequisite, and
`script-src 'self' 'wasm-unsafe-eval'` with a per-response nonce (static-server) and no inline script is the
control on that.
**Remediation / evidence:** accepted because the RPC node (`VITE_RPC_*`), the operator and public relays, the
aggregator and the GitHub API are operator- or user-configured and per-network; enumerating them would
break white-label builds. Revisit when the hosts are fixed for mainnet.

### F30 — The npm publish gate is a subset of CI

**Severity:** Low   **Disposition:** ACCEPTED-RISK
**Where:** `.github/workflows/npm-publish.yml`
**Issue:** the npm job's `verify` runs `npm ci`, the audit gate, type-check and unit tests, not the full CI
workflow (linters, build, bundle check, licence check, Playwright). The image release (F27) does run the full
workflow on the same tag.
**Impact:** a tag could publish the source package while the image job refuses the same commit. The npm
package contains source only (no build output or secrets); consumers build it themselves.
**Remediation / evidence:** accepted: the package is a source mirror for the dashboard, OIDC-published with
provenance, tag == version checked, idempotent; the same tag cannot ship an image CI refused. Calling
`node-ci.yml` from `npm-publish.yml` would close it; not required for safety.

### F31 — The cosign identity pins the repository, not the workflow

**Severity:** Info   **Disposition:** ACCEPTED-RISK
**Where:** `bootstrap/images/verify-digests.sh` (workspace), the workspace `RUNBOOK.md` verify command
**Issue:** the verify command uses `--certificate-identity-regexp` `https://github.com/meddleware-org/<name>/`
(case-insensitive), which accepts any workflow or ref in the repository; this repo's README publishes no
command of its own.
**Impact:** a workflow added to the repository by someone with write access could sign an image the
cluster check would accept.
**Remediation / evidence:** the repository is the signing boundary (only its workflows can obtain that
identity; branch and tag rules are the maintainer's). Anchoring to `docker-publish.yml@refs/tags/v*` is an
`COSIGN_IDENTITY_REGEXP` override in the workspace script; all 16 deployed images verified 2026-10-09.

### F32 — Self-hosted registry mirror jobs

**Severity:** Info   **Disposition:** DEFERRED (maintainer; `OPERATOR_TASKS.md` "Image registry credentials — record scope and rotation")
**Where:** `docker-publish.yml` `*-docker-*-private` jobs
**Issue:** the mirror jobs are `continue-on-error: true` and fail without registry credentials; the quay.io
and Docker Hub tokens (`QUAY_TOKEN`, `DOCKERHUB_TOKEN`) are long-lived and not yet inventoried.
**Impact:** the mirror may lag; a leaked registry token could push an unsigned tag (the cluster pins digests
and verifies signatures, so it would not run).
**Remediation / evidence:** the mirror is listed as best-effort and never signs; the public job path has no
`continue-on-error`. The credential inventory (scope, holder, expiry, rotation) is the maintainer item.

### F33 — One allowlisted dev-tool advisory

**Severity:** Info   **Disposition:** ACCEPTED-RISK
**Where:** `.github/audit-allowlist.json`
**Issue:** GHSA-vfj7-8cjw-p6xm (`braces`, stack exhaustion on attacker-supplied globs) has no patched release.
**Impact:** none at runtime: reached only through dev tooling (micromatch in stylelint and the eslint
TypeScript config) with repository-controlled patterns; `npm audit --omit=dev` is clean.
**Remediation / evidence:** checked-in allowlist entry with a reason and an expiry of 2027-01-01 that the
gate enforces (`audit-gate.mjs` 2026-10-09: 1 high/critical, 0 not allowlisted). The audit step runs in
`node-ci.yml` and `npm-publish.yml`.

### F34 — Licence catalogue and GitHub calls have no timeout or size bound

**Severity:** Low   **Disposition:** ACCEPTED-RISK
**Where:** `src/lib/licenses.ts` (`fetchLicenseList`, `fetchLicenseText`), `src/lib/github.ts`
**Issue:** the TS lens asks for a timeout on every `fetch` and a size check before parsing untrusted JSON.
The SPDX list and licence text come from `raw.githubusercontent.com/spdx/license-list-data/main` (a mutable
branch of a third-party repository) and are read with `res.json()` / `res.text()` without a timeout or size
cap; the GitHub calls have no timeout. Field checks exist (`LICENSE_ID_RE`, string and array checks, copies
into fresh literals).
**Impact:** a slow or oversized response stalls the picker or the push until the user reloads; a changed
licence text lands in the `LICENSE` of the package the user downloads or pushes (plain text, shown in the
download the user can read; the id is regex-checked and never reaches Move source unvalidated). No funds,
signing or chain state depend on either path.
**Remediation / evidence:** accepted for testnet: both paths are user-initiated, optional and off the money
path, and the browser bounds a stalled connection. A one-line `AbortSignal.timeout` plus a body-length check
on the two helpers closes it; fold it into the next release of this package.

## Section A — Invariant verification matrix

| # | Invariant | Enforced at | Proven by | Status |
| --- | --- | --- | --- | --- |
| I1 | Bytecode ↔ source parity | sui-token-client (`gen-template.mjs --check` in its CI); template 1.0.8 | client tests; `e2e:localnet` (client) and `e2e:testnet` PASS 2026-10-09 | HOLDS (client) |
| I2 | Injection safety: form rules + client re-assertion | `validation.ts`; client `assertTokenConfig` | validation tests; client rules tests | HOLDS |
| I3 | Fee integrity: non-zero treasury in production; fee split to it in the publish PTB | `vite.config.ts`; client `buildPublishTransaction` | build guard; client PTB tests; `e2e:testnet` delivered the fee 2026-10-09 | HOLDS |
| I4 | No backend / custody; all authority on-chain | whole `src/` | review; `suiBoundary` lint (enforced) | HOLDS |
| I5 | Relay tip bounded | `config.ts` `WALRUS_MAX_TIP_MIST` → walrus-client | SDK throws above the ceiling | HOLDS (code-only) |
| I6 | Icon URL scheme allowlist | form + client | validation tests | HOLDS |
| I7 | Deploy success = effects status; created objects by exact type | client `deployToken`, `extractPublishResult` | client tests | HOLDS (F18) |
| I8 | No `v-html`; dynamic URLs through helpers | components | grep (no `v-html`, 2026-10-09); `suiBoundary` URL rule (lint clean) | HOLDS |
| I9 | One wallet connection when embedded | wallet-adapter peer | `useWallet.test.ts` | HOLDS |
| I10 | Test harness absent from production builds | `vite.config.ts`, `main.ts`, `check:bundle` | CI + Dockerfile scan | HOLDS (F17) |
| I11 | Gated-relay proof only to the relay origin, over https | walrus-client `relayAuthFetch` | walrus-client tests; live paywall e2e 2026-10-09 | HOLDS (F15) |
| I12 | Relay choice cannot bypass the gate | walrus-relay | walrus-relay tests | HOLDS (F16) |
| I13 | Views follow account and network switches | `MyTokens.vue`; walrus-relay gate state | `myTokens.test.ts` | HOLDS (F19) |
| I14 | A published coin is never deployed twice and can always be finished | `useDeploy.ts` | `useDeploy.test.ts` | HOLDS (F24) |
| I15 | The user's GitHub token goes only to the https GitHub origin, is never redirected, cached, stored or kept after the push | `github.ts` (`SENSITIVE_FETCH`, `assertHttps`), `GithubPush.vue` | `github.test.ts`, `githubPush.test.ts` | HOLDS (F26) |
| I16 | Supply and metadata policies are applied by the coin's `init` and recorded in the registry | sui-token-client patched constants | client e2e:localnet (fixed supply + frozen metadata); `e2e:testnet` | HOLDS (F28) |
| I17 | Every network call is bounded in time and size | — | — | GAP, see F34 (ACCEPTED-RISK) |

### Vue lens categories

| Category | Status |
| --- | --- |
| Untrusted rendering | HOLDS — no `v-html`; blob thumbnails via `safeHref`; explorer links via `suiExplorerUrl`; wallet icons via the adapter (`safeIcon` allows `data:image/…` and https only); ui 0.1.31 `safeHref` also refuses credentials in the authority |
| Colour & links | HOLDS (inherited) — contrast is measured in a real browser (axe over every theme × season) in `@meddleware/ui` 0.1.31 and `design-tokens` 0.1.9 `check:contrast`; this app adds no hard-coded colours of its own (stylelint `color-no-hex` is in ui). The app itself runs no axe gate (html-validate and eslint-a11y are quality gates) |
| Build-time configuration | HOLDS — only public values in `VITE_*`; the gate's package and PlatformConfig come from access-gate-client `deployments` (walrus-relay `relayGateConfig`); `.env.example` complete (F21) |
| Test hooks (Vite) | HOLDS (F17) |
| Signing UX | HOLDS — the review panel shows network, recipient, fee and fee treasury; the wallet-adapter executor blocks a chain mismatch (0.0.17 also checks the RPC chain id and warns on look-alike wallets); the deploy step replaces the review panel, so a second submit is impossible, and no failure after a publish returns to it (F24); making the package immutable is an explicit, visible policy choice; fixed supply needs a supply above zero (F28); errors show the wallet or chain message |
| Shared-wallet state | HOLDS (F19; walrus-relay gate state follows the account) |
| Browser storage | HOLDS — the consume digest key is `mw:walrus:consume:<network>:<gate>:<address>`; the terms flag is non-sensitive; blocked storage falls back to memory (F25); tampered values are re-verified by the gateway; the GitHub token is never stored (F26) |
| Lazy boundaries | HOLDS — `@mysten/walrus` and the bytecode wasm load lazily |
| Dual app / library contract | HOLDS — no shell chrome when embedded; prefixed classes |
| Estimates | HOLDS — Walrus cost and tip shown as estimates; the fee is a fixed configured value |
| Chain-access layering | HOLDS — logic in sui-token-client, walrus-client, walrus-relay; the `suiBoundary` lint (`@meddleware/eslint-config` 0.0.2, last entry of `eslint.config.ts`) is adopted and `npm run lint:js` is clean (2026-10-09) |

### TypeScript lens categories

| Category | Status |
| --- | --- |
| Compiler strictness | `strict: true`; `noUncheckedIndexedAccess` is **off** (recorded: the parsers of untrusted data are in the client packages; the licence list parser here checks field types); `skipLibCheck: true` hides library declaration errors only, not this app's sources; `vue-tsc --noEmit` clean |
| Assertions at trust boundaries | HOLDS — the casts that remain on untrusted JSON (`licenses.ts`, `github.ts`) follow type or shape checks; no `eslint-disable` on those paths |
| Runtime validation | HOLDS for field shapes (licence list, GitHub create response); size is not bounded before parsing (F34) |
| Money and integer math | HOLDS — amounts are `bigint` in the client; `Number()` is display only |
| Promise handling | HOLDS — the three empty `catch {}` blocks (`safeIcon`, GitHub error body, URL parse) are on display and error-text paths, not security paths |
| Network I/O | GAP (F34) for licence and GitHub fetches; Sui and relay calls are the SDK's and walrus-client's (timeout on the challenge request, F15). URLs for GitHub use `encodeURIComponent` per segment; the base must be https |
| Encoding | HOLDS — `toBase64Utf8` encodes UTF-8 bytes before `btoa` (test: `héllo—`) |
| Secrets in output | HOLDS — the token is not in error text (test) or logs |
| Dynamic code | HOLDS — no `eval`, `new Function` or non-literal `import()` |
| Test-only code paths | HOLDS (F17) |
| Caller-keyed lookups | HOLDS — network-keyed config is closed over the two selectable networks |

### Walrus lens categories (icon upload)

| Category | Status |
| --- | --- |
| Payment bounds | HOLDS — client tip ceiling 50 000 000 MIST |
| Relay authentication | HOLDS (F15) — proof is audience-bound v2 |
| Relay selection | HOLDS (F16) |
| Epochs & lifetime | HOLDS — `ICON_EPOCHS = 53` (`max_epochs_ahead`); the permanent / deletable choice is visible |
| Blob ownership | HOLDS — the user's wallet owns the Blob object (register is user-signed) |
| Content integrity on read | HOLDS — the icon URL is the aggregator's `/v1/blobs/<id>`; e2e checks the exact bytes |
| Confidentiality | HOLDS — icons are public by nature |
| Flow resumability | HOLDS — walrus-client `./flow` (fresh register per attempt, never resumed because the tip relay embeds tip and nonce in the register transaction; consume reused until redeemed; same-registration retry of the upload, 0.0.26) |
| Size limits | HOLDS — client limits are UX; the edge cap is authoritative |
| Owned-blob listing | HOLDS — walrus-client 0.0.27 fixed `fetchOwnedWalrusBlobs` (u256 blob ids were dropped since 0.0.23); `WalrusBlobBrowser.vue` lists real blobs again |
| Lazy loading, network configuration | HOLDS |

### AUTH lens categories (user-supplied third-party token)

No token is issued, verified or cached, so the issuer, verifier, authorization, OAuth-client, BFF, IdP and
proxy categories are N/A. The applicable ones:

| Category | Status |
| --- | --- |
| User-supplied third-party tokens | HOLDS (F26) — sent only to `https://api.github.com` (a non-https base is refused before any request); held in a component ref for one push; cleared in `finally` after success and failure; never in browser storage, logs or errors; `autocomplete="new-password"`, `spellcheck="false"`; the hint names fine-grained scopes ("Contents" and "Administration" write) and says the token is never stored; `connect-src` covers the origin (F29) |
| Signed-challenge protocols | Consumer only — the app signs the `nft-gate:access:v2` message built by `nft-gate-client` (versioned, audience-bound, digest-first consume); the format, nonce and negative vectors are that package's and the gateways' audits. The wallet shows the message |
| Error & enumeration hygiene | HOLDS — GitHub error text is shown without the request headers; the status code is appended |
| Audit trail | N/A (no server) |

### OPS lens (real-chain harnesses)

`scripts/e2e-deploy.mjs` / `e2e-walrus-browser.mjs`; script inventory:

| Script / job | Signs? | Objects touched | Irreversible? | Dry-run default | Confirmation | Network guard | Writes IDs to |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `e2e:localnet` | yes (throwaway faucet key) | a new coin package on the local node | no (throwaway chain) | n/a | none needed | RPC is `127.0.0.1:9000` | stdout |
| `e2e:testnet` / `e2e-realchain.yml` (`suite=deploy`) | yes (`SUI_PRIV`) | a new testnet coin package, fee to the treasury | yes (testnet) | n/a | `workflow_dispatch` in the `realchain` environment; locally an explicit command | `E2E_NETWORK=testnet`; `SUI_PRIV` required, no faucet | stdout; result panel |
| `e2e:walrus` (`suite=walrus`) | yes | a testnet blob, optionally a gate pass | yes (testnet) | n/a | as above | testnet only | stdout |
| `e2e:mainnet` | yes | a real mainnet coin | yes | none | `E2E_MAINNET_CONFIRM=1`; exit 78 when skipped | `E2E_NETWORK=mainnet` | stdout |

Keys come from `SUI_PRIV` in the environment, never a file in the repo; localnet uses a throwaway key; CI is
testnet only and holds no mainnet key (F20, OPS-M7). Preflight: the sender balance must be non-zero. The
harnesses do not compare the node's chain identifier with the intended network or check a CLI version (they
use the SDK, no CLI, no global CLI state). **Run record:** `e2e:localnet` PASS 2026-10-02 (dashboard build);
`e2e:walrus` through the operator relay PASS 2026-10-01; **`e2e:testnet` PASS 2026-10-09** (real publish,
confirmation, result panel, zip, fee delivered).

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

| Dependency | Pinned version | Liveness dependency? | CVE / audit status | Notes |
| --- | --- | --- | --- | --- |
| `@meddleware/sui-token-client` | `^0.0.10` (installed 0.0.10) | every deploy | own audit | pins `@meddleware/sui-token-template` 1.0.8 bytecode |
| `@mysten/move-bytecode-template` | `~0.4.1` (0.4.1) | every deploy (wasm patcher) | Mysten package; no public external audit | accepted (OQ2) |
| `@mysten/sui` | `^2.34.0` (2.34.0) | every deploy / read | `npm audit` gate 2026-10-09: only F33 | one copy per host; ADR-0001 baseline `^2.33.1` |
| `@mysten/walrus` | `~1.2.33` | icon upload only | clean | lazy |
| `@meddleware/walrus-client` / `walrus-relay` | `^0.0.27` / `^0.1.30` | icon upload | own audits | latest published |
| `@meddleware/wallet-adapter` | peer `>=0.0.12 <0.2.0`, dev `^0.0.17` | all wallet interaction | own audit | host's copy |
| `@meddleware/access-gate-client` | dev `^0.0.8` | gate id and package for the relay | own audit | `deployments` carry the 2026-10-09 package |
| `@meddleware/ui`, `design-tokens`, `eslint-config` | `^0.1.31`, `^0.1.9`, `^0.0.2` | — | own audits | — |
| Vue / Vite / TypeScript / Vitest | 3.5.43 / 8.3.2 / 6.0.3 / 5.0.3 (plugin-vue 6.0.9, vue-tsc 3.3.12) | build | clean | TypeScript 7, vitest 5-major follow-ups declined (decision); Node 24 LTS |
| Sui full node | public gRPC (override `VITE_RPC_*`) | deploys | Mysten | fails closed |
| Operator relay (nft-gate) / public relay | testnet | icon upload | own audit / Mysten | deploys unaffected |
| `api.github.com` | https | optional repo push | — | fails closed (error shown) |
| `raw.githubusercontent.com/spdx/license-list-data` | https, `main` branch | licence picker and text | — | fails closed; F34 |
| `static-server` / `node:24-slim` | 0.1.7 / digest-pinned | runtime / build | Trivy at release (F27); Go 1.26.9 | — |

Install-time code (TS B.TS-2): the lockfile has one lifecycle script, `fsevents` 2.3.3 (dev, macOS only); no
`allowScripts`, no `overrides`; no `prepare`/`postinstall` in `package.json`. `files` whitelist: `src`
(minus `src/__tests__`), `env.d.ts`, `README.md`, `LICENSE`. First-party `0.0.x` ranges are all `^0.0.x`
(exact) or `^0.1.x` for ui/walrus-relay, which resolve to the latest published; no `~0.0.x` on a package
that signs.

### B.2 Publish authority, capabilities & secret custody

| Authority / secret | Where held | Custody | Gates | Notes |
| --- | --- | --- | --- | --- |
| npm publish | GitHub Actions | OIDC trusted publishing + provenance; opt-in `NPM_PUBLISH` | releases | F30 |
| image publish | GitHub Actions | `QUAY_*` / `DOCKERHUB_*` long-lived secrets (inventory: `OPERATOR_TASKS.md`); cosign keyless | image | digest-pinned in the cluster (F32) |
| `VITE_FEE_TREASURY_*` | `.env.production`, build args | public addresses | fee recipient | F1 |
| `SUI_PRIV_TESTNET` | environment `realchain` (not yet set) | GitHub | testnet real-chain e2e | no mainnet key in CI (F20) |
| user's wallet key | browser wallet | user | every signature | never seen by the app |
| user's GitHub token | browser memory | user | optional repo push | F26 |

CI & release integrity: actions pinned by SHA; per-job permissions (`id-token`/`attestations` only on the
merge-and-sign job, `id-token` only on the npm publish job); OIDC publish with a tag == version check and an
idempotent registry check; image release = full CI via `workflow_call` + Trivy + cosign + SPDX SBOM
attestation + provenance, no `continue-on-error` on the public path (F27); `check:bundle` proves the test mode
is absent; real-chain runs manual, testnet only; Dependabot weekly, grouped, for npm, Docker and Actions
(`.github/dependabot.yml`); `npm ci` everywhere; npm client pinned (`npm@11.20.0`); `audit-gate.mjs` in CI and
the npm job (F33).

### B.VUE-1 Hosting headers

Live headers on `sui-token-deployer.meddleware.co.uk`, read 2026-10-09: `Content-Security-Policy`
(`script-src 'self' 'wasm-unsafe-eval' 'nonce-…'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self'
https:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`,
`upgrade-insecure-requests`), `Strict-Transport-Security` (1 year, includeSubDomains), `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options:
SAMEORIGIN`. Static hosting (`public/_headers`) sends the same policy with `frame-ancestors 'none'` and
`X-Frame-Options: DENY`. `'unsafe-inline'` is for styles only; the build emits no inline script. The blanket
`https:` in `connect-src` is F29. `.map` files are not emitted (Vite default).

### B.VUE-2 Build inputs and artifacts / IMG

`node:24-slim@sha256:0e0ff40c…` builder and `static-server:0.1.7@sha256:2e227311…` runtime, both
digest-pinned (Dependabot Docker group); `npm ci`; `.dockerignore` excludes `node_modules`, `dist`, `.git`,
`.env.e2e`, `.env*.local`, test output; `npm run build && check:bundle && licenses` run in the build stage so
a harness leak or empty notices file fails the image build; the runtime stage copies `dist` and the lockfile
only; `USER 65534:65534`; no secret in any `ARG`/`ENV` (the build args are the public `VITE_*` values; no
`VITE_E2E` or `VITE_ALLOW_UNSET_TREASURY`); `CONTENT_SECURITY_POLICY` is set in the image (owner lens: VUE);
the deployment is read-only root, `runAsNonRoot` uid 65534, no privilege escalation, all capabilities
dropped, `RuntimeDefault` seccomp, `automountServiceAccountToken: false`, readiness and liveness probes on
`/`, requests 5m/16Mi and limits 100m/48Mi; digest `sha256:d9005ca3…` in both `config/images.yaml` and the
overlay; cosign signature verified 2026-10-09 (F31). Not run: a Trivy *config* scan of the Dockerfile and
manifests (the image scan runs at release).

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade — A−

| Dimension | Assessment |
| --- | --- |
| Happy-path | wizard to a mocked deploy (Playwright); executor, relay gating, licences, GitHub push, My Tokens |
| Error-path | validation messages, executor failures, relay denial, missing relay, failed push, post-publish failures (`useDeploy`) |
| Boundary / edge | supply / decimals limits (form), network and account switches, stale responses, non-ASCII base64 |
| Security-relevant | bundle scan for the harness; treasury guard; gated relay proof (live); GitHub token fetch options, clearing and storage (F26) |

Counts (2026-10-09): vitest 59/59 in 11 files (`npm test`); Playwright 10/10 (5 specs, Chromium and
Firefox, `npm run test:e2e`); `vue-tsc --noEmit`, stylelint, eslint (with `suiBoundary`) and html-validate
clean; `audit-gate.mjs` 0 not allowlisted. Every test project runs in CI (`node-ci.yml` `ci` and `e2e`
jobs). Gating variables: `VITE_E2E=1` with `--mode e2e` (mock wallet), `SUI_PRIV` / `E2E_NETWORK` /
`E2E_MAINNET_CONFIRM` (real-chain harnesses). Missing: tests for the licence helpers' timeout and size
bounds (F34).

### C.2 Hermetic vs. live paths

| Path | Hermetic? | Deferred to | Tracking |
| --- | --- | --- | --- |
| Form, wizard, executor wiring | yes | — | CI |
| Real publish, confirmation, zip, fee | no | localnet / testnet | `e2e:localnet` (PASS 2026-10-02 via the dashboard build); **`e2e:testnet` PASS 2026-10-09** |
| Gated icon upload | no | testnet operator relay | `e2e:walrus` with `E2E_RELAY=operator` (PASS 2026-10-01); paywall e2e against the live dashboard PASS 2026-10-09 |
| GitHub push to a real account | mocked fetch only | a real GitHub token (maintainer) | not run live; options and clearing are unit-tested |
| Browser contrast (axe) | no | `@meddleware/ui` gallery | ui 0.1.31 CI |

## Section D — Deployment-readiness gates

### pre-localnet

- [x] builds; type-check, three linters and unit tests green (2026-10-09)
- [x] no secrets in source; treasury values public
- [x] injection safety layered (I2); harness confined (F17)
- [x] user-supplied token held in memory only and cleared (F26; tests)

### pre-testnet

- [x] `SECURITY.md` present
- [x] mocked e2e green in CI; localnet real deploy green (dashboard build)
- [x] gated relay wired (D21) and verified live (F15, F22; paywall e2e 2026-10-09)
- [x] `e2e:testnet` re-run after 0.0.20 — PASS 2026-10-09
- [x] `suiBoundary` lint adopted — `eslint-config` 0.0.2, lint clean (I4)
- [x] image: digest-pinned bases, non-root, restricted pod, probes and limits, deployed by digest, signed with SBOM and provenance, scanned before signing (F27)
- [x] consumed IDs are the latest on-chain version — live bundle carries `access_gate` `0xd7ddaa94…` and gate `0x316f1bf9…` only (B.SC-1)
- [ ] bounded fetches for the licence and GitHub helpers — F34 (ACCEPTED-RISK; fix in the next release)

### pre-mainnet

- [ ] confirm `VITE_FEE_TREASURY_MAINNET` — maintainer item
- [ ] decide on an external review of `@mysten/move-bytecode-template` (accepted today, OQ2) — pre-mainnet external review
- [ ] mainnet real-chain run from the maintainer's machine with `E2E_MAINNET_CONFIRM=1` — mainnet-blocked
- [ ] required reviewer on `realchain` (OQ1) — maintainer decision
- [ ] registry credential inventory and rotation (F32) — `OPERATOR_TASKS.md` "Image registry credentials"
- [ ] mainnet access-gate id and package populated from the mainnet publication; empty IDs fail closed — mainnet-blocked

## Cross-project themes

- **Supply chain & release integrity** — lockfile (also shipped in the image), audit gate with one
  expiring allowlist entry (F33), OIDC provenance for npm, signed images with SBOM and provenance, Trivy
  before signing, SHA-pinned actions, grouped Dependabot; publish authority in B.2.
- **Wire-format coupling** — bytecode / source parity is the client's (`check:template`); the relay proof
  format is nft-gate's vectors (`nft-gate-client`).
- **On-chain-truth boundary** — the fee, caps and policies are in the PTBs the user signs and in the coin's
  own `init` (F28); the UI previews only.
- **Deployment readiness** — Section D.
- **Chain-access layering** — the app holds no PTB or read logic (B7); the `suiBoundary` lint enforces it.
  IDs consumed: B.SC-1 below.

### B.SC-1 ID-constant trace

| Location | Network | Value | original-id or published-at | Matches the latest on-chain version |
| --- | --- | --- | --- | --- |
| access-gate-client 0.0.8 `deployments` (via walrus-relay `relayGateConfig`) | testnet | `access_gate` `0xd7ddaa94…88c9`, PlatformConfig `0x3f81489d…e7b5` | first publication (original-id = published-at) | Y — access-gate-sui commit `7906954` records it; live bundle contains it and not `0xa55789…` |
| `VITE_ACCESS_GATE_ID_TESTNET` (CI variable, baked) | testnet | gate `0x316f1bf9…faddc` | object id | Y — live bundle contains it; not `0xfd6c3b…` |
| Sui framework | all | `0x1`, `0x2` | system | Y |

Mainnet IDs: not yet populated (mainnet-blocked).

## Normative requirements (MUST / MUST NOT)

- **VUE-M1–VUE-M9** — hold (Vue categories, B.VUE-1); VUE-M8 holds on both hosting paths (live headers read
  2026-10-09).
- **TS-M1–TS-M8** — hold except TS-M5 for the licence and GitHub helpers (F34, ACCEPTED-RISK) and the
  `noUncheckedIndexedAccess` note; strict type-check, lint, audit gate, `files` whitelist, install-script
  inventory.
- **SC-M1, SC-M3, SC-M5, SC-M9, SC-M10** — hold through sui-token-client, wallet-adapter and
  access-gate-client; the others are N/A or the client's.
- **WAL-M1–WAL-M9** — hold (Walrus categories).
- **IMG-M1–IMG-M8** — hold (F27, B.VUE-2); IMG-M8's pinned verification identity holds at repository level
  only (F31).
- **OPS-M7, OPS-M8** — hold after F20 (reviewer per OQ1); OPS-M1 (chain-identifier preflight) is N/A to
  SDK-only harnesses with a fixed RPC per network; the other OPS items concern the harness and hold.
- **AUTH-M9** — holds (F26): the user's GitHub token is memory-only, sent only to its https origin, cleared
  afterwards. AUTH-M11 — the app signs only the `nft-gate-client` message; the protocol is that package's.
- MUST refuse a production build with a zero-address treasury — holds (F1, F13).

## Implementation suggestions (SHOULD / MAY)

- SHOULD add `AbortSignal.timeout` and a body-size check to the licence and GitHub helpers (F34).
- SHOULD call `node-ci.yml` from `npm-publish.yml` so both releases share one gate (F30).
- MAY anchor the cosign identity to `docker-publish.yml` on `refs/tags/v*` via `COSIGN_IDENTITY_REGEXP` (F31).
- MAY run a Trivy config scan of the Dockerfile and manifests in CI.
- MAY show the coin type's package id next to the explorer link in the result panel.

## Open questions (`OQ#`)

1. **OQ1** Require a reviewer (the maintainer) on the `realchain` environment, so a testnet
   real-chain run needs an explicit approval? (Same choice as nft-gate OQ8.)
2. **OQ2** Commission an external review of `@mysten/move-bytecode-template`, or keep the accepted
   reliance on Mysten's programme? *(Accepted 2026-09-24 — maintainer note; recorded here so the
   pre-mainnet gate tracks it.)*

## Risks

- **Wasm patcher** — a compromised `@mysten/move-bytecode-template` could patch arbitrary bytecode;
  mitigated by lockfile pinning and the client's byte-exact template check, not eliminated.
- **Relay and aggregator liveness** — icon upload only; deploys work without an icon.
- **Public RPC limits** — deploys depend on the configured full node.
- **Third-party hosts on optional paths** — the SPDX list on a mutable branch and the GitHub API (F34).
- **Registry credentials** — long-lived quay.io and Docker Hub tokens until the maintainer inventory and
  rotation plan (F32).

## Maintainer notes

**Treasury address (`VITE_FEE_TREASURY_*`):** the committed `.env.production` address is the
operator default; `assertTreasuryConfigured` guards against the zero address only. Override per
deployment with build arguments.

**`@mysten/move-bytecode-template` — ACCEPTED (OQ2):** official Mysten Labs package, maintained by
the team behind the Sui VM and the Move bytecode format.

## Re-verification log

- 2026-09-24 — first-pass baseline (F1–F14).
- 2026-09-29 — B1: harness confined to `--mode e2e`, treasury bypass narrowed, `check:bundle` in CI
  and the Dockerfile (F17, `8e540d5`).
- 2026-09-30 — gated relay proof via the `fetch` hook (F15, `1e44270`); review panel shows the fee
  treasury.
- 2026-10-01 — relay selection waits for the operator health check (F16, walrus-relay 0.1.21,
  token-deployer-ui 0.0.15); D21 gating; `e2e:walrus` through the operator relay passed.
- 2026-10-02 — B7: the token logic moved to `@meddleware/sui-token-client` 0.0.1 (F18,
  token-deployer-ui 0.0.17); verified with 42 unit tests, the mocked Playwright suite and a real
  localnet browser deploy.
- 2026-10-02 — re-verified against VUE, TS, SUI_CLIENT, WALRUS, IMG and OPS (B9 pilot): front matter
  and lens sections added, stale text (unpublished, JSON-RPC, old CI names) corrected. F19 (My Tokens
  network switch, 0.0.20), F20 (testnet-only real-chain CI, `realchain` environment) and F21
  (`.env.example`) RESOLVED; F22 Positive; F23 ADJUDICATED; OQ1 added. Counts: 45 unit, 10 Playwright;
  localnet deploy through the dashboard's production build passed; live sweep clean.
- 2026-10-02 — module and package names that collide with the template or framework are refused in
  the form (sui-token-client F1, 0.0.21). F24 (Medium, double publish on retry) RESOLVED in 0.0.23 with
  a **Finish setup** step; 50 unit, 10 Playwright, real localnet browser deploy passed.
- 2026-10-02 — F25 (storage that never throws) RESOLVED in 0.0.24 with walrus-client 0.0.24 and
  walrus-relay 0.1.25 (pending-purchase guard).
- 2026-10-03 — consumer wave: 0.0.25 (walrus-relay 0.1.26, walrus-client 0.0.25, access-gate-client 0.0.4, ui 0.1.30); `check:bundle` clean; deployed; live sweep and dashboard tab clean.
- 2026-10-08 — Lens dates reconciled with the registry (`check-template-dates.mjs`): base 2026-10-08, and SUI_CLIENT/GO 2026-10-08 and TS 2026-10-03 where cited. The changes (AUTH/PLATFORM/MCP/DB registered, the GO token row moved to AUTH, JSR in trusted publishing, layered injection guards) alter no disposition here. SUI_CLIENT's new layered-injection requirement holds: `validation.ts` gates the form and the client's rules re-assert every check (invariant 2).
- 2026-10-09 — re-verified against the current `main` (0.0.35) and the lens set including AUTH (the user's
  GitHub token) and the IMG/OPS extensions. F1–F25 re-checked, dispositions unchanged; F15 and F20 evidence
  extended. New: F26 (GitHub token fetch options, 0.0.34, RESOLVED), F27 (release gate, scan, notices,
  explicit non-root, 0.0.34–0.0.35, RESOLVED), F28 (supply and metadata policies in the coin's `init`,
  0.0.32–0.0.33, RESOLVED), F29 (blanket `connect-src https:`, ACCEPTED-RISK), F30 (npm publish gate is a
  subset of CI, ACCEPTED-RISK), F31 (cosign identity at repository level, ACCEPTED-RISK), F32 (mirror jobs
  and registry credential inventory, DEFERRED to `OPERATOR_TASKS.md`), F33 (allowlisted `braces` advisory,
  ACCEPTED-RISK), F34 (licence and GitHub fetches without timeout or size bound, ACCEPTED-RISK). Stale
  facts corrected: versions (0.0.35, sui 2.34.0, sui-token-client 0.0.10, walrus-client 0.0.27,
  walrus-relay 0.1.30), access_gate `0xd7ddaa94…` and relay gate `0x316f1bf9…` (the old `0xa55789…` /
  `0xfd6c3b…` are superseded and absent from the live bundle), static-server 0.1.7, headers read live,
  Section D (`e2e:testnet` PASS 2026-10-09 and `suiBoundary` adopted ticked). Counts: 59 unit tests, 10
  Playwright runs. Lens dates reconciled to the registry. `OQ1`/`OQ2` stay open.
