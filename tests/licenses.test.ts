import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchLicenseList,
  fetchLicenseText,
  NO_LICENSE,
  __resetLicenseCaches,
} from '../src/lib/licenses.js'

const LIST = {
  licenses: [
    { licenseId: 'MIT', name: 'MIT License', isOsiApproved: true, isDeprecatedLicenseId: false },
    { licenseId: 'CC0-1.0', name: 'Creative Commons Zero v1.0 Universal', isOsiApproved: false, isDeprecatedLicenseId: false },
    { licenseId: 'GPL-1.0', name: 'GNU GPL v1.0 (deprecated)', isOsiApproved: false, isDeprecatedLicenseId: true },
  ],
}

function mockFetch(bodyByUrl: Record<string, { ok?: boolean; json?: unknown; text?: string; status?: number }>) {
  return vi.fn<(url: string) => Promise<Response>>(async (url: string): Promise<Response> => {
    const entry = bodyByUrl[url as string] ?? bodyByUrl['*']
    return {
      ok: entry?.ok ?? true,
      status: entry?.status ?? 200,
      json: async () => entry?.json,
      text: async () => entry?.text ?? '',
    } as Response
  }) as unknown as typeof fetch
}

const LIST_URL = 'https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json'

beforeEach(() => __resetLicenseCaches())

describe('fetchLicenseList', () => {
  it('filters deprecated, sorts, includes NONE, and surfaces popular first', async () => {
    const f = mockFetch({ [LIST_URL]: { json: LIST } })
    const cat = await fetchLicenseList(f)

    expect(cat.all[0]).toBe(NO_LICENSE)
    const ids = cat.all.map((l) => l.id)
    expect(ids).toContain('MIT')
    expect(ids).toContain('CC0-1.0')
    expect(ids).not.toContain('GPL-1.0') // deprecated dropped

    // popular ordering: CC0 before MIT
    const popIds = cat.popular.map((l) => l.id)
    expect(popIds.indexOf('CC0-1.0')).toBeLessThan(popIds.indexOf('MIT'))
  })

  it('caches the list (one network call across calls)', async () => {
    const f = mockFetch({ [LIST_URL]: { json: LIST } })
    await fetchLicenseList(f)
    await fetchLicenseList(f)
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })
})

describe('fetchLicenseText', () => {
  it('fetches and caches license text', async () => {
    const url = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/MIT.txt'
    const f = mockFetch({ [url]: { text: 'MIT LICENSE BODY' } })
    expect(await fetchLicenseText('MIT', f)).toBe('MIT LICENSE BODY')
    await fetchLicenseText('MIT', f)
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1)
  })

  it('returns null (no fetch) for the proprietary choice', async () => {
    const f = mockFetch({})
    expect(await fetchLicenseText('NONE', f)).toBeNull()
    expect(await fetchLicenseText('', f)).toBeNull()
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0)
  })

  it('throws on a failed fetch', async () => {
    const url = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/BOGUS.txt'
    const f = mockFetch({ [url]: { ok: false, status: 404 } })
    await expect(fetchLicenseText('BOGUS', f)).rejects.toThrow(/BOGUS/)
  })
})
