# ── build stage ───────────────────────────────────────────────────────────────
# Standalone build — the Docker context is this repo root. All @meddleware/*
# dependencies resolve from the npm registry, so they must be published before
# this image is built.
#
#   docker build \
#     --build-arg VITE_NETWORK=testnet \
#     --build-arg VITE_FEE_TREASURY_TESTNET=0x... \
#     --build-arg VITE_FEE_TREASURY_MAINNET=0x... \
#     -t token-deployer-ui:<tag> .
#
# Build args (VITE_* are baked into the static bundle at build time):
#   VITE_NETWORK                        — "testnet" | "mainnet"  (default: testnet)
#   VITE_FEE_TREASURY_TESTNET           — operator treasury for testnet (REQUIRED — build fails without it)
#   VITE_FEE_TREASURY_MAINNET           — operator treasury for mainnet (REQUIRED — build fails without it)
#   VITE_FEE_MIST                       — fee in MIST (optional, default 1000000000)
#   VITE_WALRUS_RELAY_TESTNET           — operator relay URL for testnet (optional)
#   VITE_WALRUS_RELAY_MAINNET           — operator relay URL for mainnet (optional)
#   VITE_WALRUS_RPC_TESTNET             — gRPC fullnode for Walrus testnet (optional)
#   VITE_WALRUS_RPC_MAINNET             — gRPC fullnode for Walrus mainnet (optional)
#   VITE_RPC_TESTNET / VITE_RPC_MAINNET — override gRPC fullnode URLs (optional)
#   VITE_ACCESS_GATE_ID_{NET}           — operator's Gate shared object ID (optional; the package and
#                                         PlatformConfig come from the published access_gate deployment)
#   VITE_ACCESS_GATE_SOULBOUND_{NET}    — "true" if soulbound (optional)
#   VITE_ACCESS_GATE_PRICE_MIST_{NET}   — purchase price in MIST (optional)
#   VITE_WALRUS_MAX_TIP_MIST            — max relay tip cap in MIST (optional)
#   VITE_PUBLIC_URL                     — canonical origin for OG/JSON-LD (optional)
#
# .env.production is gitignored — treasury addresses must be supplied via build args.
# Content-Security-Policy served by static-server (verified 2026-09-30: production build loaded in
# Chromium under this policy with zero violations). script-src stays 'self' plus 'wasm-unsafe-eval' (Walrus / Move bytecode WebAssembly); connect-src allows
# any https origin because RPC, relay, aggregator and Seal key-server hosts are partly operator- or
# chain-configured; img-src allows https:/data:/blob: for on-chain images and local previews.
ARG CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"

FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ARG VITE_NETWORK=testnet
ARG VITE_FEE_TREASURY_TESTNET
ARG VITE_FEE_TREASURY_MAINNET
ARG VITE_FEE_MIST
ARG VITE_WALRUS_RELAY_TESTNET
ARG VITE_WALRUS_RELAY_MAINNET
ARG VITE_WALRUS_RPC_TESTNET
ARG VITE_WALRUS_RPC_MAINNET
ARG VITE_RPC_TESTNET
ARG VITE_RPC_MAINNET
ARG VITE_ACCESS_GATE_ID_TESTNET
ARG VITE_ACCESS_GATE_SOULBOUND_TESTNET
ARG VITE_ACCESS_GATE_PRICE_MIST_TESTNET
ARG VITE_ACCESS_GATE_ID_MAINNET
ARG VITE_ACCESS_GATE_SOULBOUND_MAINNET
ARG VITE_ACCESS_GATE_PRICE_MIST_MAINNET
ARG VITE_WALRUS_MAX_TIP_MIST
ARG VITE_PUBLIC_URL

ENV VITE_NETWORK=${VITE_NETWORK} \
    VITE_FEE_TREASURY_TESTNET=${VITE_FEE_TREASURY_TESTNET} \
    VITE_FEE_TREASURY_MAINNET=${VITE_FEE_TREASURY_MAINNET} \
    VITE_FEE_MIST=${VITE_FEE_MIST} \
    VITE_WALRUS_RELAY_TESTNET=${VITE_WALRUS_RELAY_TESTNET} \
    VITE_WALRUS_RELAY_MAINNET=${VITE_WALRUS_RELAY_MAINNET} \
    VITE_WALRUS_RPC_TESTNET=${VITE_WALRUS_RPC_TESTNET} \
    VITE_WALRUS_RPC_MAINNET=${VITE_WALRUS_RPC_MAINNET} \
    VITE_RPC_TESTNET=${VITE_RPC_TESTNET} \
    VITE_RPC_MAINNET=${VITE_RPC_MAINNET} \
    VITE_ACCESS_GATE_ID_TESTNET=${VITE_ACCESS_GATE_ID_TESTNET} \
    VITE_ACCESS_GATE_SOULBOUND_TESTNET=${VITE_ACCESS_GATE_SOULBOUND_TESTNET} \
    VITE_ACCESS_GATE_PRICE_MIST_TESTNET=${VITE_ACCESS_GATE_PRICE_MIST_TESTNET} \
    VITE_ACCESS_GATE_ID_MAINNET=${VITE_ACCESS_GATE_ID_MAINNET} \
    VITE_ACCESS_GATE_SOULBOUND_MAINNET=${VITE_ACCESS_GATE_SOULBOUND_MAINNET} \
    VITE_ACCESS_GATE_PRICE_MIST_MAINNET=${VITE_ACCESS_GATE_PRICE_MIST_MAINNET} \
    VITE_WALRUS_MAX_TIP_MIST=${VITE_WALRUS_MAX_TIP_MIST} \
    VITE_PUBLIC_URL=${VITE_PUBLIC_URL}

# No VITE_E2E build arg exists, and vite.config.ts refuses VITE_E2E=1 outside `--mode e2e` (so a
# stray .env file cannot enable it either); the bundle check is the last line of defence.
RUN npm run build && npm run check:bundle

# ── runtime stage ─────────────────────────────────────────────────────────────
# static-server is a minimal Go binary image — no shell, no package manager.
# SPA_FALLBACK serves index.html for any extensionless path (Vue Router history mode).
# CACHE_IMMUTABLE_PREFIX matches the /assets/ directory Vite emits with content hashes.
FROM quay.io/meddleware-org/static-server:0.1.6@sha256:be51c4ee9c80fbbeda1f546efa918a72628388bd0fac0f52876e8234b51275c0
ARG CSP
ENV CONTENT_SECURITY_POLICY="${CSP}"

COPY --from=build /app/dist /app/public

ENV SERVE_DIR=/app/public \
    SPA_FALLBACK=true \
    CACHE_IMMUTABLE_PREFIX=/assets/

EXPOSE 8080
