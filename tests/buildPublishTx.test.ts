import { describe, it, expect } from 'vitest'
import type { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import {
  buildPublishTransaction,
  buildFinalizeTransaction,
  needsFinalize,
  extractPublishResult,
} from '../src/lib/buildPublishTx.js'
import type { TokenConfig } from '../src/lib/types.js'

const sender = '0x' + '1'.repeat(64)
const recipient = '0x' + '2'.repeat(64)
const coinType = '0xPKG::mytoken::MYTOKEN'

// ─── introspection helpers over Transaction.getData() ─────────────────────────

type Cmd = ReturnType<Transaction['getData']>['commands'][number]

function commands(tx: Transaction): Cmd[] {
  return tx.getData().commands
}

function byKind(tx: Transaction, kind: string): Cmd[] {
  return commands(tx).filter((c) => c.$kind === kind)
}

/** Resolve an `{ Input: n }` argument to its decoded Pure bytes. */
function pureBytesOfInput(tx: Transaction, arg: unknown): Uint8Array {
  const idx = (arg as { $kind: string; Input: number }).Input
  const input = tx.getData().inputs[idx] as { $kind: string; Pure?: { bytes: string } }
  if (input.$kind !== 'Pure' || !input.Pure) throw new Error('expected a Pure input')
  return fromBase64(input.Pure.bytes)
}

function pureAddr(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function pureU64(bytes: Uint8Array): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true)
}

function baseConfig(over: Partial<TokenConfig> = {}): TokenConfig {
  return {
    packageName: 'my_token', moduleName: 'mytoken', structName: 'MYTOKEN',
    symbol: 'MTK', name: 'My Token', description: 'desc', iconUrl: '', decimals: 9,
    initialSupply: 0n, supplyPolicy: 'mintable', metadataPolicy: 'updatable',
    packagePolicy: 'immutable', recipient: sender, license: 'MIT',
    packageDescription: '', projectName: '',
    ...over,
  }
}

const publishArgs = (over: Partial<Parameters<typeof buildPublishTransaction>[0]> = {}) => ({
  moduleBytes: new Uint8Array([1, 2, 3]),
  sender,
  feeMist: 1_000_000_000n,
  feeRecipient: recipient,
  gasBudget: 500_000_000n,
  packagePolicy: 'immutable' as const,
  ...over,
})

// ─── buildPublishTransaction ──────────────────────────────────────────────────

describe('buildPublishTransaction', () => {
  it('publishes the module and sets sender + gas budget', () => {
    const tx = buildPublishTransaction(publishArgs())
    const publish = byKind(tx, 'Publish')
    expect(publish).toHaveLength(1)
    expect(tx.getData().sender).toBe(sender)
    expect(tx.getData().gasData.budget).toBe('500000000')
  })

  it('splits EXACTLY the fee from the gas coin to the configured treasury', () => {
    const tx = buildPublishTransaction(publishArgs({ feeMist: 1_000_000_000n }))
    const [split] = byKind(tx, 'SplitCoins') as Array<Cmd & { SplitCoins: any }>
    expect(split).toBeDefined()
    // must split from the gas coin, not an arbitrary coin
    expect(split.SplitCoins.coin.$kind).toBe('GasCoin')
    expect(pureU64(pureBytesOfInput(tx, split.SplitCoins.amounts[0]))).toBe(1_000_000_000n)

    const [transfer] = byKind(tx, 'TransferObjects') as Array<Cmd & { TransferObjects: any }>
    expect(pureAddr(pureBytesOfInput(tx, transfer.TransferObjects.address))).toBe(recipient)
  })

  it('omits the fee split entirely when feeMist is 0', () => {
    const tx = buildPublishTransaction(publishArgs({ feeMist: 0n }))
    expect(byKind(tx, 'SplitCoins')).toHaveLength(0)
  })

  it('makes the package immutable under the immutable policy', () => {
    const tx = buildPublishTransaction(publishArgs({ packagePolicy: 'immutable' }))
    const calls = byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>
    expect(calls.some((c) => c.MoveCall.function === 'make_immutable')).toBe(true)
  })

  it('transfers the UpgradeCap to the sender under the upgradeable policy', () => {
    const tx = buildPublishTransaction(publishArgs({ packagePolicy: 'upgradeable', feeMist: 0n }))
    expect(byKind(tx, 'MoveCall')).toHaveLength(0)
    const [transfer] = byKind(tx, 'TransferObjects') as Array<Cmd & { TransferObjects: any }>
    // the only transfer is the UpgradeCap -> sender (no fee split here)
    expect(pureAddr(pureBytesOfInput(tx, transfer.TransferObjects.address))).toBe(sender)
  })
})

// ─── buildFinalizeTransaction ─────────────────────────────────────────────────

const treasuryCapId = '0x' + 'a'.repeat(64)
const metadataCapId = '0x' + 'b'.repeat(64)
const currencyRef = { objectId: '0x' + 'c'.repeat(64), version: '1', digest: 'CURRENCYDIGEST' }

const finalizeArgs = (config: TokenConfig) => ({
  config,
  coinType,
  treasuryCapId,
  metadataCapId,
  currencyRef,
  sender,
  gasBudget: 500_000_000n,
})

describe('buildFinalizeTransaction', () => {
  it('calls finalize_registration first when currencyRef is provided', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig()))
    const calls = byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>
    // finalize_registration is the first MoveCall in the PTB
    expect(calls[0]?.MoveCall?.function).toBe('finalize_registration')
    expect(calls[0]?.MoveCall?.typeArguments).toEqual([coinType])
  })

  it('omits finalize_registration when currencyRef is absent', () => {
    const { currencyRef: _cr, ...argsNoCurrency } = finalizeArgs(baseConfig())
    const tx = buildFinalizeTransaction(argsNoCurrency)
    const calls = byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>
    expect(calls.every((c) => c.MoveCall.function !== 'finalize_registration')).toBe(true)
  })

  it('mints supply scaled by decimals to the recipient', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig({ initialSupply: 1000n, decimals: 6 })))
    const mint = (byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>).find(
      (c) => c.MoveCall.function === 'mint',
    )
    expect(mint).toBeDefined()
    expect(mint!.MoveCall.typeArguments).toEqual([coinType])
    // 1000 * 10^6
    expect(pureU64(pureBytesOfInput(tx, mint!.MoveCall.arguments[1]))).toBe(1_000_000_000n)
  })

  it('freezes the TreasuryCap under the fixed supply policy', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig({ supplyPolicy: 'fixed' })))
    const freeze = (byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>).filter(
      (c) => c.MoveCall.function === 'public_freeze_object',
    )
    expect(freeze.some((c) => c.MoveCall.typeArguments[0].includes('coin::TreasuryCap'))).toBe(true)
  })

  it('freezes the MetadataCap under the frozen metadata policy', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig({ metadataPolicy: 'frozen' })))
    const freeze = (byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>).filter(
      (c) => c.MoveCall.function === 'public_freeze_object',
    )
    expect(freeze.some((c) => c.MoveCall.typeArguments[0].includes('coin_registry::MetadataCap'))).toBe(true)
  })

  it('routes both caps to a different recipient when supply/metadata stay open', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig({ recipient })))
    const transfers = byKind(tx, 'TransferObjects') as Array<Cmd & { TransferObjects: any }>
    // TreasuryCap + MetadataCap both go to the recipient (no mint here)
    expect(transfers).toHaveLength(2)
    for (const t of transfers) {
      expect(pureAddr(pureBytesOfInput(tx, t.TransferObjects.address))).toBe(recipient)
    }
  })

  it('does not freeze when policies are open and recipient is the sender', () => {
    const tx = buildFinalizeTransaction(finalizeArgs(baseConfig({ initialSupply: 5n })))
    const freeze = (byKind(tx, 'MoveCall') as Array<Cmd & { MoveCall: any }>).filter(
      (c) => c.MoveCall.function === 'public_freeze_object',
    )
    expect(freeze).toHaveLength(0)
  })
})

// ─── needsFinalize ────────────────────────────────────────────────────────────

describe('needsFinalize', () => {
  it('is false for the pure-default config (publish-only)', () => {
    expect(needsFinalize(baseConfig(), sender)).toBe(false)
  })

  it('is true when any policy/supply/recipient differs from the default', () => {
    expect(needsFinalize(baseConfig({ initialSupply: 1n }), sender)).toBe(true)
    expect(needsFinalize(baseConfig({ supplyPolicy: 'fixed' }), sender)).toBe(true)
    expect(needsFinalize(baseConfig({ metadataPolicy: 'frozen' }), sender)).toBe(true)
    expect(needsFinalize(baseConfig({ recipient }), sender)).toBe(true)
  })

  it('treats recipient case-insensitively', () => {
    expect(needsFinalize(baseConfig({ recipient: sender.toUpperCase() }), sender)).toBe(false)
  })
})

// ─── extractPublishResult ─────────────────────────────────────────────────────

describe('extractPublishResult', () => {
  const changes = [
    { type: 'published', packageId: '0xPKG' },
    { type: 'created', objectType: `0x2::coin::TreasuryCap<${coinType}>`, objectId: '0xT' },
    { type: 'created', objectType: `0x2::coin_registry::MetadataCap<${coinType}>`, objectId: '0xM' },
    { type: 'created', objectType: `0x2::coin_registry::Currency<${coinType}>`, objectId: '0xC', version: '7', digest: 'CDIG' },
    { type: 'created', objectType: `0x2::package::UpgradeCap`, objectId: '0xU' },
  ]

  it('extracts package id, coin type, all cap ids, and currency version/digest', () => {
    const r = extractPublishResult(changes, {
      network: 'testnet', digest: '0xD', feeRecipient: recipient, feeMist: 1_000_000_000n,
    })
    expect(r.packageId).toBe('0xPKG')
    expect(r.coinType).toBe(coinType)
    expect(r.treasuryCapId).toBe('0xT')
    expect(r.metadataCapId).toBe('0xM')
    expect(r.currencyId).toBe('0xC')
    expect(r.currencyVersion).toBe('7')
    expect(r.currencyDigest).toBe('CDIG')
    expect(r.upgradeCapId).toBe('0xU')
    expect(r.feeRecipient).toBe(recipient)
    expect(r.feeMist).toBe('1000000000')
  })

  it('leaves the upgrade cap undefined for an immutable publish', () => {
    const immutable = changes.filter((c) => !(c.objectType ?? '').includes('UpgradeCap'))
    const r = extractPublishResult(immutable, {
      network: 'mainnet', digest: '0xD', feeRecipient: recipient, feeMist: 0n,
    })
    expect(r.upgradeCapId).toBeUndefined()
    expect(r.coinType).toBe(coinType)
    // currency ref still extracted
    expect(r.currencyVersion).toBe('7')
    expect(r.currencyDigest).toBe('CDIG')
  })
})
