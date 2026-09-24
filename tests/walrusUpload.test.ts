import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the options handed to `walrus(...)` and the SuiGrpcClient so we can
// assert the relay host + tip guard are wired, without a live network. `vi.mock`
// is hoisted, so the mock fns are declared via `vi.hoisted`.
const { walrusMock, grpcCtor, extendMock } = vi.hoisted(() => {
  const extendMock = vi.fn<(ext: unknown) => { extendedWith: unknown }>((ext: unknown) => ({ extendedWith: ext }))
  return {
    walrusMock: vi.fn<(_cfg?: unknown) => { __walrusExtension: boolean }>((_cfg?: unknown) => ({ __walrusExtension: true })),
    extendMock,
    // `src/lib/walrus.ts` calls `new SuiGrpcClient(...)`, so the mock must be newable — an
    // arrow function is not a constructor (`new arrowFn()` throws). Use a function expression.
    grpcCtor: vi.fn<() => { $extend: typeof extendMock }>(function () {
      return { $extend: extendMock }
    }),
  }
})
vi.mock('@mysten/walrus', () => ({ walrus: walrusMock }))
vi.mock('@mysten/sui/grpc', () => ({ SuiGrpcClient: grpcCtor }))

import { createWalrusClient, walrusBlobUrl } from '../src/lib/walrus.js'
import {
  WALRUS_RELAY_HOSTS,
  WALRUS_MAX_TIP_MIST,
  validateIconFile,
  ICON_MAX_BYTES,
} from '../src/config.js'

type WalrusCfg = { wasmUrl?: string; uploadRelay: { host: string; sendTip: { max: number } } }

describe('createWalrusClient', () => {
  beforeEach(() => {
    walrusMock.mockClear()
    grpcCtor.mockClear()
    extendMock.mockClear()
  })

  it('defaults to the configured relay host + max-tip guard', () => {
    createWalrusClient('testnet', 'wasm-url')
    expect(walrusMock).toHaveBeenCalledTimes(1)
    const cfg = walrusMock.mock.calls[0][0] as unknown as WalrusCfg
    expect(cfg.uploadRelay.host).toBe(WALRUS_RELAY_HOSTS.testnet)
    expect(cfg.uploadRelay.sendTip.max).toBe(Number(WALRUS_MAX_TIP_MIST))
    // The bare-string arg is treated as the WASM URL (back-compat).
    expect(cfg.wasmUrl).toBe('wasm-url')
  })

  it('honours an explicit relay host + max-tip override', () => {
    createWalrusClient('mainnet', {
      uploadRelayHost: 'https://my.relay.example',
      uploadRelayMaxTipMist: 123n,
    })
    const cfg = walrusMock.mock.calls[0][0] as unknown as WalrusCfg
    expect(cfg.uploadRelay.host).toBe('https://my.relay.example')
    expect(cfg.uploadRelay.sendTip.max).toBe(123)
  })

  it('never sets a tip address/kind (the relay declares those via /v1/tip-config)', () => {
    createWalrusClient('testnet')
    const cfg = walrusMock.mock.calls[0][0] as unknown as WalrusCfg & {
      uploadRelay: { sendTip: Record<string, unknown> }
    }
    expect(cfg.uploadRelay.sendTip).not.toHaveProperty('address')
    expect(cfg.uploadRelay.sendTip).not.toHaveProperty('kind')
  })
})

describe('walrusBlobUrl', () => {
  it('points at the network aggregator raw-blob route', () => {
    expect(walrusBlobUrl('testnet', 'BLOB123')).toContain('/v1/blobs/BLOB123')
  })
})

describe('validateIconFile (UX/cost gate — not a security control)', () => {
  it('accepts an in-spec PNG', () => {
    expect(validateIconFile({ type: 'image/png', size: 10 * 1024 })).toBeNull()
  })

  it('rejects a disallowed MIME type', () => {
    const msg = validateIconFile({ type: 'application/pdf', size: 1024 })
    expect(msg).toMatch(/Unsupported image type/)
    expect(msg).toContain('pdf')
  })

  it('rejects a file over the size cap', () => {
    const msg = validateIconFile({ type: 'image/png', size: ICON_MAX_BYTES + 1 })
    expect(msg).toMatch(/too large/)
  })

  it('accepts a file exactly at the cap', () => {
    expect(validateIconFile({ type: 'image/webp', size: ICON_MAX_BYTES })).toBeNull()
  })
})
