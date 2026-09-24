import { describe, it, expect, vi } from 'vitest'
import { createRepoAndPush, toBase64Utf8 } from '../src/lib/github.js'

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
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
