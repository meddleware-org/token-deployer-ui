import { describe, it, expect, vi, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { useAccessGate, type GateClient } from '@meddleware/walrus-relay'
import { PUBLIC_WALRUS_RELAY_HOSTS, operatorRelayHost, parseAccessGate } from '../src/config.js'

// walrus-relay 0.1.31: the gate must be the published deployment, and the price is read from the chain.

const failingClient = (): GateClient => {
  const fail = async (): Promise<never> => {
    throw new Error('node unreachable')
  }
  return { getObject: fail, listOwnedObjects: fail } as unknown as GateClient
}

describe('the access gate configuration', () => {
  it('carries no purchase price (it is read from the chain)', () => {
    const gate = parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate' })
    expect(gate).not.toBeNull()
    expect(gate).not.toHaveProperty('priceMist')
  })

  it('ignores a leftover VITE_ACCESS_GATE_PRICE_MIST_* value', () => {
    const withPrice = parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate', VITE_ACCESS_GATE_PRICE_MIST_TESTNET: '5' })
    expect(withPrice).toEqual(parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate' }))
  })

  it('is accepted by useAccessGate (published deployment) and starts with no terms', () => {
    const gate = useAccessGate({ network: 'testnet', gate: parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate' }), getClient: failingClient })
    expect(gate.gateConfigured).toBe(true)
    expect(gate.terms.value).toBeNull()
  })

  it('is refused by useAccessGate when it names another package', () => {
    const base = parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate' })!
    const forged = { ...base, packageId: '0x' + 'ab'.repeat(32) }
    expect(() => useAccessGate({ network: 'testnet', gate: forged, getClient: failingClient })).toThrow(/not the published testnet deployment/)
  })

  it('stays inert and open without a gate', () => {
    const gate = useAccessGate({ network: 'testnet', gate: null, getClient: failingClient })
    expect(gate.gateConfigured).toBe(false)
    expect(gate.hasAccess.value).toBe(true)
  })

  it('does not open the wallet when the price cannot be read', async () => {
    const gate = useAccessGate({ network: 'testnet', gate: parseAccessGate('testnet', { VITE_ACCESS_GATE_ID_TESTNET: '0xgate' }), getClient: failingClient })
    const executor = { signAndExecute: vi.fn(), waitForTransaction: vi.fn() }
    await expect(gate.purchase(executor, '0x1')).rejects.toThrow(/Could not read the pass price/)
    expect(executor.signAndExecute).not.toHaveBeenCalled()
    expect(gate.purchaseError.value).toMatch(/Could not read the pass price/)
  })
})

describe('operatorRelayHost', () => {
  afterEach(() => vi.restoreAllMocks())

  it('falls back to the public relay when unset', () => {
    expect(operatorRelayHost('testnet', undefined)).toBe(PUBLIC_WALRUS_RELAY_HOSTS.testnet)
    expect(operatorRelayHost('mainnet', '')).toBe(PUBLIC_WALRUS_RELAY_HOSTS.mainnet)
  })

  it('accepts an https host and a loopback http testbed', () => {
    expect(operatorRelayHost('testnet', 'https://relay.example.com')).toBe('https://relay.example.com')
    expect(operatorRelayHost('testnet', 'http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
  })

  it('ignores (and warns about) a plain-http remote host or a non-URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(operatorRelayHost('testnet', 'http://relay.example.com')).toBe(PUBLIC_WALRUS_RELAY_HOSTS.testnet)
    expect(operatorRelayHost('mainnet', 'relay.example.com')).toBe(PUBLIC_WALRUS_RELAY_HOSTS.mainnet)
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

// Every custom property the components read must be one design-tokens defines: an undefined name falls
// through to a literal fallback that ignores the theme. --warning is a fill colour; text uses --warning-text.
const require = createRequire(import.meta.url)
const tokenCss = readFileSync(require.resolve('@meddleware/design-tokens/tokens.css'), 'utf8')
const seasonCss = readFileSync(require.resolve('@meddleware/design-tokens/seasons.css'), 'utf8')
const defined = new Set([...(tokenCss + seasonCss).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? vueFiles(join(dir, e.name)) : e.name.endsWith('.vue') ? [join(dir, e.name)] : [],
  )
}

describe('colour tokens read by the components', () => {
  const files = vueFiles(join(import.meta.dirname, '..', 'src'))

  it('finds the components', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s reads only properties design-tokens defines (or defines itself)', (file) => {
    const css = readFileSync(file, 'utf8')
    const own = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))
    const used = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!)
    expect(used.filter((name) => !defined.has(name) && !own.has(name))).toEqual([])
  })

  it('never uses --warning as a text colour (use --warning-text)', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/(^|[^-])color:\s*var\(--warning\)/m)
    }
  })
})
