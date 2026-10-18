import { describe, it, expect, vi } from 'vitest'
import { createRepoAndPush, toBase64Utf8 } from '../src/lib/github.js'

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status: ok ? status : status === 200 ? 500 : status })
}

describe('toBase64Utf8', () => {
  it('encodes UTF-8 correctly', () => {
    expect(toBase64Utf8('hello')).toBe('aGVsbG8=')
    // round-trips multibyte
    expect(Buffer.from(toBase64Utf8('héllo—'), 'base64').toString('utf8')).toBe('héllo—')
  })
})

describe('createRepoAndPush', () => {
  it('creates the repo then PUTs each file, reporting progress', async () => {
    const fetcher = vi.fn<(url: string, _init?: RequestInit) => Promise<Response>>(async (url: string, _init?: RequestInit): Promise<Response> => {
      if (url.endsWith('/user/repos')) {
        return jsonRes({ full_name: 'alice/my_token', html_url: 'https://github.com/alice/my_token', owner: { login: 'alice' }, name: 'my_token' })
      }
      return jsonRes({ content: {} }, true, 201)
    }) as unknown as typeof fetch

    const progress: number[] = []
    const res = await createRepoAndPush({
      token: 'ghp_x',
      repoName: 'my_token',
      files: { 'Move.toml': 'a', 'sources/mytoken.move': 'b' },
      fetcher,
      onProgress: (d) => progress.push(d),
    })

    expect(res.htmlUrl).toBe('https://github.com/alice/my_token')
    expect(res.owner).toBe('alice')
    // 1 create + 2 file PUTs
    const calls = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls.length).toBe(3)
    expect(calls[0][1]?.method).toBe('POST')
    expect(calls[1][1]?.method).toBe('PUT')
    expect(progress).toEqual([1, 2])
  })

  it('surfaces the GitHub error message on repo-create failure', async () => {
    const fetcher = vi.fn<() => Promise<Response>>(async (): Promise<Response> => jsonRes({ message: 'name already exists on this account' }, false, 422)) as unknown as typeof fetch
    await expect(
      createRepoAndPush({ token: 't', repoName: 'dupe', files: { a: 'x' }, fetcher }),
    ).rejects.toThrow(/already exists/)
  })

  it('never lets the token follow a redirect, carry cookies or be cached', async () => {
    const fetcher = vi.fn<(url: string) => Promise<Response>>(async (url: string): Promise<Response> =>
      url.endsWith('/user/repos')
        ? jsonRes({ html_url: 'h', owner: { login: 'bob' }, name: 'r', full_name: 'bob/r' })
        : jsonRes({}, true, 201),
    ) as unknown as typeof fetch
    await createRepoAndPush({ token: 'secret', repoName: 'r', files: { a: 'x', b: 'y' }, fetcher })
    const calls = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls).toHaveLength(3)
    for (const [, init] of calls) {
      expect(init?.redirect).toBe('error')
      expect(init?.credentials).toBe('omit')
      expect(init?.cache).toBe('no-store')
    }
  })

  it('refuses a non-https API base before sending anything', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    await expect(
      createRepoAndPush({ token: 'secret', repoName: 'r', files: {}, fetcher, apiBase: 'http://api.github.com' }),
    ).rejects.toThrow(/non-HTTPS/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the token as a Bearer header', async () => {
    const fetcher = vi.fn<(url: string) => Promise<Response>>(async (url: string): Promise<Response> =>
      url.endsWith('/user/repos')
        ? jsonRes({ html_url: 'h', owner: { login: 'bob' }, name: 'r', full_name: 'bob/r' })
        : jsonRes({}, true, 201),
    ) as unknown as typeof fetch
    await createRepoAndPush({ token: 'secret', repoName: 'r', files: { a: 'x' }, fetcher })
    const headers = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
  })
})

describe('bounded GitHub calls (audit F34)', () => {
  const repoReply = () => jsonRes({ html_url: 'h', owner: { login: 'bob' }, name: 'r', full_name: 'bob/r' })

  /** A fetch that never answers, and rejects when the request's signal fires (as a browser does). */
  function hangingFetch(): typeof fetch {
    return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    ) as unknown as typeof fetch
  }

  it('gives every request a timeout signal', async () => {
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url: string): Promise<Response> =>
      url.endsWith('/user/repos') ? repoReply() : jsonRes({}, true, 201),
    ) as unknown as typeof fetch
    await createRepoAndPush({ token: 't', repoName: 'r', files: { a: 'x' }, fetcher })
    const calls = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
    expect(calls).toHaveLength(2)
    for (const [, init] of calls) expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails with a clear message when the repository request times out (30s)', async () => {
    const ctl = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal)
    try {
      const pending = createRepoAndPush({ token: 't', repoName: 'r', files: { a: 'x' }, fetcher: hangingFetch() })
      await Promise.resolve()
      ctl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
      await expect(pending).rejects.toThrow(/repository request timed out after 30s/)
      expect(timeout).toHaveBeenCalledWith(30_000)
    } finally {
      timeout.mockRestore()
    }
  })

  it('refuses an oversized declared reply before reading it', async () => {
    const big = new Response('{}', { status: 200, headers: { 'content-length': String(5 * 1024 * 1024) } })
    const fetcher = vi.fn(async () => big) as unknown as typeof fetch
    await expect(createRepoAndPush({ token: 't', repoName: 'r', files: { a: 'x' }, fetcher })).rejects.toThrow(/larger than 1024 KiB/)
  })

  it('refuses a reply that grows past the cap without declaring a length', async () => {
    const chunk = new Uint8Array(512 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 8) controller.enqueue(chunk)
        else controller.close()
      },
    })
    const fetcher = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch
    await expect(createRepoAndPush({ token: 't', repoName: 'r', files: { a: 'x' }, fetcher })).rejects.toThrow(/larger than 1024 KiB/)
  })

  it('reports a non-JSON repository reply instead of an opaque parse error', async () => {
    const fetcher = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(createRepoAndPush({ token: 't', repoName: 'r', files: { a: 'x' }, fetcher })).rejects.toThrow(/not valid JSON/)
  })
})

