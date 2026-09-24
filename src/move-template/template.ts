// AUTO-GENERATED ARTIFACT — do not edit by hand.
//
// Base64 of the compiled `sui_token_template` Move module (binary format v7),
// produced by `sui move build --build-env testnet` from
// blockchain/sui/sui-token-template. Regenerate with scripts/regen-template.sh
// whenever the canonical template source changes (see move-template/README.md).
//
// The DEFAULT_* values below are the constant-pool defaults compiled into the
// module. The deployer patches the module by matching these exact defaults and
// replacing them (see lib/template.ts). They are DISTINCT on purpose: identical
// Move constants deduplicate into a single unpatchable pool entry.

export const TEMPLATE_MODULE_B64 =
  'oRzrCwcAAAUKAQAMAgweAyohBEsIBVNaB60B3QEIigNgBuoDVAq+BAUMwwQ6AA8BDgIGAgcCEAIRAAICAAEDBwACBAwBAAEDAAABAAEDAQwBAAEFBQIAAAoAAQABEgMEAAMJCAkBAAMLBgcBAgQMDQEBDAUNCgsAAwUCBQQMBA4CCAAHCAUAAgsEAQgACwIBCAABCgIBCAEBCAAHCQACCAEIAQgBCAEHCAUCCwMBCQALAgEJAAILAwEJAAcIBQELBAEJAAEGCAUBBQELAgEIAAIJAAUBCwQBCAATQ3VycmVuY3lJbml0aWFsaXplcgtNZXRhZGF0YUNhcBJTVUlfVE9LRU5fVEVNUExBVEUGU3RyaW5nC1RyZWFzdXJ5Q2FwCVR4Q29udGV4dARjb2luDWNvaW5fcmVnaXN0cnkLZHVtbXlfZmllbGQIZmluYWxpemUEaW5pdBVuZXdfY3VycmVuY3lfd2l0aF9vdHcPcHVibGljX3RyYW5zZmVyBnNlbmRlcgZzdHJpbmcSc3VpX3Rva2VuX3RlbXBsYXRlCHRyYW5zZmVyCnR4X2NvbnRleHQEdXRmOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIBCQoCEA9URU1QTEFURV9TWU1CT0wKAg4NVEVNUExBVEVfTkFNRQoCFRRURU1QTEFURV9ERVNDUklQVElPTgoCEhFURU1QTEFURV9JQ09OX1VSTAACAQgBAAAAAAIbCwAHAAcBEQEHAhEBBwMRAQcEEQEKATgADAMKATgBDAILAwoBLhEFOAILAgsBLhEFOAMCAAA='

/** Identifiers compiled into the template module (renamed at patch time). */
export const TEMPLATE_IDENTIFIERS = {
  /** module identifier (lowercase) */
  module: 'sui_token_template',
  /** one-time-witness struct identifier (uppercase) */
  struct: 'SUI_TOKEN_TEMPLATE',
} as const

/** Distinct constant-pool defaults the deployer patches away from. */
export const TEMPLATE_DEFAULTS = {
  decimals: 9,
  symbol: 'TEMPLATE_SYMBOL',
  name: 'TEMPLATE_NAME',
  description: 'TEMPLATE_DESCRIPTION',
  iconUrl: 'TEMPLATE_ICON_URL',
} as const
