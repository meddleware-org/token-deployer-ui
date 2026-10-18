// Bounded network reads for the licence catalogue and the GitHub push (audit F34). Every request has a
// timeout, and a response body is read with a size cap before it is parsed, so a slow or oversized
// reply from a third party fails with a clear message instead of stalling the picker or the push.

type Fetcher = typeof fetch

/** Largest SPDX list accepted (the real list is ~120 KiB). */
export const MAX_LICENSE_LIST_BYTES = 2 * 1024 * 1024
/** Largest single licence text accepted (the longest SPDX texts are tens of KiB). */
export const MAX_LICENSE_TEXT_BYTES = 256 * 1024
/** Largest GitHub API reply read (a created-repository record or an error body). */
export const MAX_GITHUB_RESPONSE_BYTES = 1024 * 1024

/** Time allowed for one licence request, headers and body. */
export const LICENSE_TIMEOUT_MS = 15_000
/** Time allowed for one GitHub request, headers and body. */
export const GITHUB_TIMEOUT_MS = 30_000

/**
 * `fetcher(url, init)` with a timeout that covers the headers and the body. A timeout or any other network
 * failure rejects with a message naming `label`.
 */
export async function fetchWithTimeout(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  try {
    return await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`, { cause: e })
    }
    throw e
  }
}

/**
 * Read a response body as UTF-8 text, refusing more than `maxBytes`. A declared `Content-Length` over the
 * cap fails before any byte is read; a body that grows past it is cancelled.
 */
export async function readBoundedText(res: Response, maxBytes: number, label: string): Promise<string> {
  const tooLarge = (): Error => new Error(`${label} is larger than ${Math.round(maxBytes / 1024)} KiB; refusing to read it.`)
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw tooLarge()
      }
      chunks.push(value)
    }
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`${label} timed out while reading.`, { cause: e })
    }
    throw e
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** {@link readBoundedText}, then `JSON.parse`; invalid JSON rejects with a message naming `label`. */
export async function readBoundedJson(res: Response, maxBytes: number, label: string): Promise<unknown> {
  const text = await readBoundedText(res, maxBytes, label)
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${label} is not valid JSON.`, { cause: e })
  }
}
