// Optional, ZERO-BACKEND GitHub repo creation. Uses the user's OWN token (a
// fine-grained PAT with "Contents: read and write" + "Administration: read and
// write", or a classic `repo`-scoped token), calling the GitHub REST API
// directly from the browser (CORS-enabled). The repo is created in the user's
// account; this app's backend is never involved.

const DEFAULT_API_BASE = 'https://api.github.com'

/**
 * UTF-8-safe base64 encoding that works in both the browser and Node — used to
 * encode file contents for the GitHub Contents API.
 *
 * @param input Text to encode.
 * @returns The base64 representation of the UTF-8 bytes.
 */
export function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  // btoa is available in browsers and modern Node globals.
  return btoa(binary)
}

/** Arguments for {@link createRepoAndPush}. */
export interface CreateRepoAndPushArgs {
  /** The user's own GitHub token; sent only to the GitHub API over HTTPS. */
  token: string
  /** Name of the repository to create in the user's account. */
  repoName: string
  /** Optional repository description. */
  description?: string
  /** Create the repository as private (default: public). */
  isPrivate?: boolean
  /** Map of repo-relative path -> file contents (text). */
  files: Record<string, string>
  /** Commit message for each file push (default: `Add <path>`). */
  commitMessage?: string
  /** Override the GitHub API base (must be HTTPS); defaults to api.github.com. */
  apiBase?: string
  /** Injectable fetch implementation (for testing). */
  fetcher?: typeof fetch
  /** Progress callback invoked after each file is pushed. */
  onProgress?: (done: number, total: number) => void
}

/** The created repository's identity, returned by {@link createRepoAndPush}. */
export interface GithubRepoResult {
  /** The owning account login. */
  owner: string
  /** The repository name. */
  repo: string
  /** The repository's `html_url`. */
  htmlUrl: string
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Require an https API base so the PAT is never sent over cleartext. */
function assertHttps(apiBase: string): void {
  let url: URL
  try {
    url = new URL(apiBase)
  } catch {
    throw new Error('GitHub: invalid API base URL.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('GitHub: refusing to send your token over a non-HTTPS connection.')
  }
}

/** Encode a repo file path segment-by-segment, preserving the `/` separators. */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
    .join('/')
}

async function ghError(res: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const body = (await res.json()) as { message?: string }
    if (body?.message) message = body.message
  } catch {
    /* ignore */
  }
  throw new Error(`GitHub: ${message} (${res.status})`)
}

/**
 * Create a repo in the user's account and push each file (one commit per file
 * via the Contents API; the first commit initialises the default branch). Returns
 * the repo's html_url.
 */
export async function createRepoAndPush(args: CreateRepoAndPushArgs): Promise<GithubRepoResult> {
  const fetcher = args.fetcher ?? fetch
  const apiBase = args.apiBase ?? DEFAULT_API_BASE
  assertHttps(apiBase)

  const createRes = await fetcher(`${apiBase}/user/repos`, {
    method: 'POST',
    headers: ghHeaders(args.token),
    body: JSON.stringify({
      name: args.repoName,
      description: args.description ?? '',
      private: args.isPrivate ?? false,
      auto_init: false,
    }),
  })
  if (!createRes.ok) await ghError(createRes, 'could not create the repository')
  const repo = (await createRes.json()) as {
    full_name: string
    html_url: string
    owner: { login: string }
    name: string
  }
  const owner = repo.owner.login

  const entries = Object.entries(args.files)
  let done = 0
  for (const [path, content] of entries) {
    const putRes = await fetcher(
      `${apiBase}/repos/${owner}/${encodeURIComponent(repo.name)}/contents/${encodePath(path)}`,
      {
        method: 'PUT',
        headers: ghHeaders(args.token),
        body: JSON.stringify({
          message: args.commitMessage ?? `Add ${path}`,
          content: toBase64Utf8(content),
        }),
      },
    )
    if (!putRes.ok) await ghError(putRes, `could not add ${path}`)
    args.onProgress?.(++done, entries.length)
  }

  return { owner, repo: repo.name, htmlUrl: repo.html_url }
}
