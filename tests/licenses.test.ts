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
    { licenseId: '0BSD', name: 'BSD Zero Clause License', isOsiApproved: true, isDeprecatedLicenseId: false },
    { licenseId: 'CC0-1.0', name: 'Creative Commons Zero v1.0 Universal', isOsiApproved: false, isDeprecatedLicenseId: false },
    { licenseId: 'GPL-1.0', name: 'GNU GPL v1.0 (deprecated)', isOsiApproved: false, isDeprecatedLicenseId: true },
  ],
}

function mockFetch(bodyByUrl: Record<string, { ok?: boolean; json?: unknown; text?: string; status?: number }>) {
  return vi.fn<(url: string) => Promise<Response>>(async (url: string): Promise<Response> => {
    const entry = bodyByUrl[url as string] ?? bodyByUrl['*']
    const body = entry?.json !== undefined ? JSON.stringify(entry.json) : (entry?.text ?? '')
    return new Response(body, { status: entry?.ok === false ? (entry.status ?? 500) : (entry?.status ?? 200) })
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
    expect(ids).toContain('CC0-1.0') // still selectable
    expect(ids).not.toContain('GPL-1.0') // deprecated dropped

    // popular ordering: the 0BSD default first, CC0 still offered
    const popIds = cat.popular.map((l) => l.id)
    expect(popIds[0]).toBe('0BSD')
    expect(popIds.indexOf('0BSD')).toBeLessThan(popIds.indexOf('MIT'))
    expect(popIds).toContain('CC0-1.0')
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

describe('bounded licence fetches (audit F34)', () => {
  const TEXT_URL = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/MIT.txt'

  it('gives each request a timeout signal', async () => {
    const f = mockFetch({ [LIST_URL]: { json: LIST }, [TEXT_URL]: { text: 'x' } })
    await fetchLicenseList(f)
    await fetchLicenseText('MIT', f)
    const calls = (f as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls
    expect(calls).toHaveLength(2)
    for (const [, init] of calls) expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('times out a request that never answers (15s)', async () => {
    const ctl = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal)
    try {
      const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
        (_url: string, init?: RequestInit): Promise<Response> =>
          new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
      ) as unknown as typeof fetch
      const pending = fetchLicenseList(f)
      await Promise.resolve()
      ctl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
      await expect(pending).rejects.toThrow(/timed out after 15s/)
      expect(timeout).toHaveBeenCalledWith(15_000)
    } finally {
      timeout.mockRestore()
    }
  })

  it('times out a body that stalls after the headers', async () => {
    const ctl = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal)
    try {
      const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (_url: string, init?: RequestInit): Promise<Response> => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
          },
        })
        return new Response(body, { status: 200 })
      }) as unknown as typeof fetch
      const pending = fetchLicenseText('MIT', f)
      await new Promise((r) => setTimeout(r, 0))
      ctl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
      await expect(pending).rejects.toThrow(/timed out while reading/)
    } finally {
      timeout.mockRestore()
    }
  })

  it('refuses an oversized licence text and does not cache it', async () => {
    const f = mockFetch({ [TEXT_URL]: { text: 'a'.repeat(256 * 1024 + 1) } })
    await expect(fetchLicenseText('MIT', f)).rejects.toThrow(/larger than 256 KiB/)
    const ok = mockFetch({ [TEXT_URL]: { text: 'MIT' } })
    expect(await fetchLicenseText('MIT', ok)).toBe('MIT')
  })

  it('refuses an oversized licence list by its declared length', async () => {
    const f = vi.fn(async () => new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } })) as unknown as typeof fetch
    await expect(fetchLicenseList(f)).rejects.toThrow(/larger than 2048 KiB/)
  })

  it('rejects a list that is not JSON with a clear message', async () => {
    const f = mockFetch({ [LIST_URL]: { text: '<html>' } })
    await expect(fetchLicenseList(f)).rejects.toThrow(/not valid JSON/)
  })
})
