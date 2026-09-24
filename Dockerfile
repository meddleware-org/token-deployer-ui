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
#   VITE_RPC_TESTNET / VITE_RPC_MAINNET — override JSON-RPC fullnode URLs (optional)
#   VITE_ACCESS_GATE_ID_{NET}           — operator's Gate shared object ID (optional)
#   VITE_ACCESS_GATE_NFT_TYPE_{NET}     — access NFT type (optional)
#   VITE_ACCESS_GATE_SOULBOUND_{NET}    — "true" if soulbound (optional)
#   VITE_ACCESS_GATE_PRICE_MIST_{NET}   — purchase price in MIST (optional)
#   VITE_WALRUS_MAX_TIP_MIST            — max relay tip cap in MIST (optional)
#   VITE_PUBLIC_URL                     — canonical origin for OG/JSON-LD (optional)
#
# .env.production is gitignored — treasury addresses must be supplied via build args.
FROM node:24-slim AS build

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
ARG VITE_ACCESS_GATE_NFT_TYPE_TESTNET
ARG VITE_ACCESS_GATE_SOULBOUND_TESTNET
ARG VITE_ACCESS_GATE_PRICE_MIST_TESTNET
ARG VITE_ACCESS_GATE_ID_MAINNET
ARG VITE_ACCESS_GATE_NFT_TYPE_MAINNET
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
    VITE_ACCESS_GATE_NFT_TYPE_TESTNET=${VITE_ACCESS_GATE_NFT_TYPE_TESTNET} \
    VITE_ACCESS_GATE_SOULBOUND_TESTNET=${VITE_ACCESS_GATE_SOULBOUND_TESTNET} \
    VITE_ACCESS_GATE_PRICE_MIST_TESTNET=${VITE_ACCESS_GATE_PRICE_MIST_TESTNET} \
    VITE_ACCESS_GATE_ID_MAINNET=${VITE_ACCESS_GATE_ID_MAINNET} \
    VITE_ACCESS_GATE_NFT_TYPE_MAINNET=${VITE_ACCESS_GATE_NFT_TYPE_MAINNET} \
    VITE_ACCESS_GATE_SOULBOUND_MAINNET=${VITE_ACCESS_GATE_SOULBOUND_MAINNET} \
    VITE_ACCESS_GATE_PRICE_MIST_MAINNET=${VITE_ACCESS_GATE_PRICE_MIST_MAINNET} \
    VITE_WALRUS_MAX_TIP_MIST=${VITE_WALRUS_MAX_TIP_MIST} \
    VITE_PUBLIC_URL=${VITE_PUBLIC_URL}

RUN npm run build

# ── runtime stage ─────────────────────────────────────────────────────────────
# static-server is a minimal Go binary image — no shell, no package manager.
# SPA_FALLBACK serves index.html for any extensionless path (Vue Router history mode).
# CACHE_IMMUTABLE_PREFIX matches the /assets/ directory Vite emits with content hashes.
FROM quay.io/meddleware-org/static-server:0.1.1

COPY --from=build /app/dist /app/public

ENV SERVE_DIR=/app/public \
    SPA_FALLBACK=true \
    CACHE_IMMUTABLE_PREFIX=/assets/

EXPOSE 8080
