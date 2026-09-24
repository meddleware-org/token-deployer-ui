// Dynamic license catalogue, sourced from the SPDX license-list-data archive at
// runtime (CORS-enabled, `access-control-allow-origin: *`). No registry is
// bundled or maintained here. License choice only affects the downloadable
// package (LICENSE file + Move.toml/README/source header), never the on-chain
// bytecode.

const SPDX_BASE = 'https://raw.githubusercontent.com/spdx/license-list-data/main'
const LIST_URL = `${SPDX_BASE}/json/licenses.json`
const textUrl = (id: string) => `${SPDX_BASE}/text/${encodeURIComponent(id)}.txt`

export interface SpdxLicense {
  id: string
  name: string
  osiApproved: boolean
  deprecated: boolean
}

/** The "no license" / proprietary choice; never fetched. */
export const NO_LICENSE: SpdxLicense = {
  id: 'NONE',
  name: 'None / proprietary (all rights reserved)',
  osiApproved: false,
  deprecated: false,
}

/** Ids surfaced first in the picker. CC0 is the project default. */
export const POPULAR_LICENSE_IDS = [
  'CC0-1.0',
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'BSD-2-Clause',
  'GPL-3.0-only',
  'GPL-2.0-only',
  'LGPL-3.0-only',
  'AGPL-3.0-only',
  'MPL-2.0',
  'ISC',
  'Unlicense',
] as const

export const DEFAULT_LICENSE_ID = 'CC0-1.0'

type Fetcher = typeof fetch

/** SPDX ids are limited to these characters; anything else is rejected. */
const LICENSE_ID_RE = /^[A-Za-z0-9.\-+]+$/

interface RawLicense {
  licenseId: string
  name: string
  isOsiApproved?: boolean
  isDeprecatedLicenseId?: boolean
}

let listCache: SpdxLicense[] | null = null
const textCache = new Map<string, string>()

export interface LicenseCatalogue {
  /** Popular licenses first (in POPULAR order), each also present in `all`. */
  popular: SpdxLicense[]
  /** All non-deprecated licenses, alphabetical by id, prefixed with NO_LICENSE. */
  all: SpdxLicense[]
}

/** Fetch and cache the SPDX license list. */
export async function fetchLicenseList(fetcher: Fetcher = fetch): Promise<LicenseCatalogue> {
  if (!listCache) {
    const res = await fetcher(LIST_URL)
    if (!res.ok) throw new Error(`failed to load SPDX license list (${res.status})`)
    const json = (await res.json()) as { licenses?: RawLicense[] }
    if (!json || !Array.isArray(json.licenses)) {
      throw new Error('unexpected SPDX license list format')
    }
    listCache = json.licenses
      .filter(
        (l) =>
          l &&
          typeof l.licenseId === 'string' &&
          LICENSE_ID_RE.test(l.licenseId) &&
          typeof l.name === 'string' &&
          !l.isDeprecatedLicenseId,
      )
      .map((l) => ({
        id: l.licenseId,
        name: l.name,
        osiApproved: Boolean(l.isOsiApproved),
        deprecated: Boolean(l.isDeprecatedLicenseId),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  const byId = new Map(listCache.map((l) => [l.id, l]))
  const popular = POPULAR_LICENSE_IDS.map((id) => byId.get(id)).filter((l): l is SpdxLicense =>
    Boolean(l),
  )
  return { popular, all: [NO_LICENSE, ...listCache] }
}

/**
 * Fetch and cache the full license text for an id. Returns null for the
 * proprietary/no-license choice (no LICENSE file should be written).
 */
export async function fetchLicenseText(
  id: string,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const key = id.trim()
  if (!key || ['none', 'unlicensed', 'noassertion'].includes(key.toLowerCase())) return null
  if (!LICENSE_ID_RE.test(key)) throw new Error(`invalid license id "${key}"`)
  if (textCache.has(key)) return textCache.get(key) as string
  const res = await fetcher(textUrl(key))
  if (!res.ok) throw new Error(`failed to load license text for "${key}" (${res.status})`)
  const text = await res.text()
  textCache.set(key, text)
  return text
}

/** Test seam: reset caches. */
export function __resetLicenseCaches(): void {
  listCache = null
  textCache.clear()
}
