// Client-side Move bytecode patching.
//
// The current on-chain binary format (v7) cannot be round-tripped by
// @mysten/move-bytecode-template's `update_identifiers` / `update_constants`
// helpers (they throw "missing field `version`"). However, `deserialize` and
// `serialize` DO handle v7 losslessly, so we patch the decoded JSON directly:
// rename identifiers in place and overwrite constant-pool entries. This is
// verified end-to-end against a localnet publish (see scripts/publish-localnet.mjs).

import init, { deserialize, serialize } from '@mysten/move-bytecode-template'
import { bcs } from '@mysten/bcs'
import { fromBase64 } from '@mysten/sui/utils'
import { SAFE_TEXT } from './validation.js'
import {
  TEMPLATE_MODULE_B64,
  TEMPLATE_IDENTIFIERS,
  TEMPLATE_DEFAULTS,
} from '../move-template/template.js'

let initPromise: Promise<unknown> | null = null
let wasmInput: unknown = undefined

/**
 * Register the wasm asset URL without loading it (browser). Call once at app
 * startup, e.g. `configureWasm(wasmUrl)`. The actual fetch is deferred until the
 * first patch, so the 343 kB wasm doesn't block initial page load. In Node/tests
 * this is unnecessary — the nodejs build loads its own wasm.
 */
export function configureWasm(input: unknown): void {
  wasmInput = input
}

/**
 * Initialise the wasm module (idempotent + cached). Lazily triggered by the
 * patch pipeline; uses the URL registered via `configureWasm` in the browser.
 */
export function initTemplateWasm(): Promise<unknown> {
  if (!initPromise) {
    initPromise = Promise.resolve()
      .then(() => (init as unknown as (i?: unknown) => unknown)(wasmInput))
      .catch(() => undefined)
  }
  return initPromise
}

/** BCS bytes for a `vector<u8>` / `String` constant (uleb length + utf8). */
function vecU8(value: string): number[] {
  return Array.from(bcs.string().serialize(value).toBytes())
}

function sameBytes(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export interface PatchParams {
  moduleName: string
  structName: string
  symbol: string
  name: string
  description: string
  iconUrl: string
  decimals: number
}

interface DecodedConstant {
  type_: 'U8' | { Vector: 'U8' } | unknown
  data: number[]
}

interface DecodedModule {
  identifiers: string[]
  constant_pool: DecodedConstant[]
}

/**
 * Patch the template module with the caller's token parameters and return
 * publishable module bytes. Pure with respect to the shipped artifact — a fresh
 * copy is decoded each call.
 */
export async function patchTemplateModule(params: PatchParams): Promise<Uint8Array> {
  await initTemplateWasm()

  const original = fromBase64(TEMPLATE_MODULE_B64)
  const json = deserialize(original) as unknown as DecodedModule

  // 1) Rename the module + struct identifiers in place (index-preserving, so all
  //    handle references stay valid; the verifier does not require sorted ids).
  const rename: Record<string, string> = {
    [TEMPLATE_IDENTIFIERS.module]: params.moduleName,
    [TEMPLATE_IDENTIFIERS.struct]: params.structName,
  }
  json.identifiers = json.identifiers.map((id) => rename[id] ?? id)

  // 2) Overwrite the five constant-pool defaults with the requested values.
  patchU8Constant(json, TEMPLATE_DEFAULTS.decimals, params.decimals)
  patchVecConstant(json, TEMPLATE_DEFAULTS.symbol, params.symbol)
  patchVecConstant(json, TEMPLATE_DEFAULTS.name, params.name)
  patchVecConstant(json, TEMPLATE_DEFAULTS.description, params.description)
  patchVecConstant(json, TEMPLATE_DEFAULTS.iconUrl, params.iconUrl)

  return new Uint8Array(serialize(json as unknown as Parameters<typeof serialize>[0]))
}

function patchU8Constant(json: DecodedModule, current: number, next: number): void {
  const entry = json.constant_pool.find(
    (c) => c.type_ === 'U8' && c.data.length === 1 && c.data[0] === current,
  )
  if (!entry) throw new Error(`template U8 constant ${current} not found (artifact drift?)`)
  if (next < 0 || next > 255 || !Number.isInteger(next)) {
    throw new Error(`decimals must be an integer 0..255, got ${next}`)
  }
  entry.data = [next]
}

/** Upper bound on a patched string constant, matching the form's icon-URL cap. */
const MAX_VEC_CONSTANT_LEN = 512

function patchVecConstant(json: DecodedModule, current: string, next: string): void {
  // Defence in depth: the on-chain metadata must match the generated source, so
  // reject the same characters the form/source guard rejects, and bound the size.
  if (!SAFE_TEXT.test(next)) {
    throw new Error('constant contains quotes, backslashes or control characters')
  }
  if (next.length > MAX_VEC_CONSTANT_LEN) {
    throw new Error(`constant exceeds ${MAX_VEC_CONSTANT_LEN} characters`)
  }
  const currentBytes = vecU8(current)
  const entry = json.constant_pool.find((c) => c.type_ !== 'U8' && sameBytes(c.data, currentBytes))
  if (!entry) throw new Error(`template constant "${current}" not found (artifact drift?)`)
  entry.data = vecU8(next)
}
