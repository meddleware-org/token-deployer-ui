import { describe, it, expect, beforeAll } from 'vitest'
import init, { deserialize } from '@mysten/move-bytecode-template'
import { fromBase64 } from '@mysten/sui/utils'
import {
  TEMPLATE_MODULE_B64,
  TEMPLATE_IDENTIFIERS,
  TEMPLATE_DEFAULTS,
} from '../src/move-template/template.js'

// Provenance guard: the checked-in bytecode (.mv, as base64) and the hand-kept
// TEMPLATE_IDENTIFIERS / TEMPLATE_DEFAULTS in move-template/template.ts must stay
// consistent. If regen-template.sh is run but the DEFAULTS aren't updated (or vice
// versa), the deployer's patch would silently fail to match — this test catches
// that drift in CI instead of at deploy time.

interface Decoded {
  identifiers: string[]
  constant_pool: { type_: unknown; data: number[] }[]
}

// A BCS-encoded String/vector<u8> is a uleb length prefix + utf8 bytes; for these
// short defaults the prefix is a single byte, so slice(1) recovers the text.
const asStr = (data: number[]) => Buffer.from(data.slice(1)).toString('utf8')

describe('template artifact provenance', () => {
  let decoded: Decoded

  beforeAll(async () => {
    await (init as unknown as () => Promise<unknown>)()
    decoded = deserialize(fromBase64(TEMPLATE_MODULE_B64)) as unknown as Decoded
  })

  it('is a valid v7 Move module (magic a11ceb0b)', () => {
    expect(Buffer.from(fromBase64(TEMPLATE_MODULE_B64).slice(0, 4)).toString('hex')).toBe('a11ceb0b')
  })

  it('contains the declared template identifiers', () => {
    expect(decoded.identifiers).toContain(TEMPLATE_IDENTIFIERS.module)
    expect(decoded.identifiers).toContain(TEMPLATE_IDENTIFIERS.struct)
  })

  it('contains the declared decimals default as a U8 constant', () => {
    expect(
      decoded.constant_pool.some((c) => c.type_ === 'U8' && c.data[0] === TEMPLATE_DEFAULTS.decimals),
    ).toBe(true)
  })

  it('contains each declared string default as a distinct vector constant', () => {
    for (const def of [
      TEMPLATE_DEFAULTS.symbol,
      TEMPLATE_DEFAULTS.name,
      TEMPLATE_DEFAULTS.description,
      TEMPLATE_DEFAULTS.iconUrl,
    ]) {
      expect(
        decoded.constant_pool.some((c) => c.type_ !== 'U8' && asStr(c.data) === def),
        `default "${def}" not found in the shipped bytecode`,
      ).toBe(true)
    }
  })
})
