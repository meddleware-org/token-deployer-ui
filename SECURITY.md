# Security Policy

## Scope

This policy covers `@meddleware/token-deployer-ui`: the browser app (and embeddable view) that lets a
user publish their own Sui coin from their wallet, pay the operator fee, and download the matching
Move source package. It covers `src/**`, the build configuration and the real-chain harness scripts.
The template artefacts, patching and transaction building are `@meddleware/sui-token-client`'s
(report those in that repository).

It does not cover `@meddleware/sui-token-template` (its own policy), the Walrus network, the
NFT-gated upload relay (`nft-gate`), or the user's wallet.

## Security model (invariants)

These invariants are load-bearing. A report demonstrating that any is violated is in scope:

1. **No backend, no custody.** Every transaction is built in the browser and signed by the user's
   wallet; the app holds no keys and no funds.
2. **Fee integrity.** The operator fee is split from gas to the build-time treasury address inside
   the publish transaction, and shown (with the treasury address) before signing. A production build
   fails on an unset or zero treasury.
3. **Layered injection safety.** Token identity fields are validated in the form **and** re-checked
   where bytecode is patched and where the source package is generated; no downstream guard relies on
   an upstream one.
4. **Bytecode ↔ source parity.** The shipped bytecode and the downloadable source derive from the
   same template commit, enforced by tests.
5. **Test harness absent from production.** The mock wallet and stub client compile only in the
   dedicated `e2e` build mode; the production bundle is scanned for their markers in CI and in the
   image build.
6. **Gated-relay proofs stay on the relay.** The wallet-signed access proof is attached only to
   requests to the configured relay origin, over https.

## Content-Security-Policy

The container image serves `script-src 'self' 'wasm-unsafe-eval'` (the Move bytecode and Walrus
WebAssembly), no inline scripts, `object-src 'none'`, `base-uri 'self'`; the static-host `_headers`
file carries the same policy plus HSTS and Permissions-Policy.

## Supported versions

Only the latest published version and image receive security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Report by emailing
**<security@meddleware.co.uk>** with a description, reproduction/PoC if available, and the version,
image tag or commit SHA tested. You will receive an acknowledgement within **3 business days** and a
resolution plan within **14 days** for confirmed issues; Critical issues (CVSS ≥ 9.0) are
prioritised for same-day acknowledgement.

## Disclosure

Once a fix is released, a security advisory will be published on the GitHub repository. Reporters may
be credited by name unless they prefer to remain anonymous.
