// The user's own GitHub token (AUTH lens, "user-supplied third-party tokens"): it is held for one
// operation, cleared whether that succeeds or fails, and never written to browser storage.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { createRepoAndPush } = vi.hoisted(() => ({ createRepoAndPush: vi.fn() }))
vi.mock('../src/lib/github.js', () => ({ createRepoAndPush }))
vi.mock('../src/lib/licenses.js', () => ({ fetchLicenseText: vi.fn(async () => null) }))
vi.mock('@meddleware/sui-token-client/package', () => ({ buildPackageFiles: () => ({ 'Move.toml': 'x' }) }))

import GithubPush from '../src/components/GithubPush.vue'

const config = { packageName: 'my_token', name: 'My Token', symbol: 'MTK', license: 'MIT' } as never
const result = { packageId: '0x1' } as never

async function open() {
  const w = mount(GithubPush, { props: { config, result }, attachTo: document.body })
  await w.find('button').trigger('click')
  return w
}

let setItem: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  createRepoAndPush.mockReset()
  setItem = vi.spyOn(Storage.prototype, 'setItem')
})
afterEach(() => {
  setItem.mockRestore()
  document.body.innerHTML = ''
})

describe('GithubPush token handling', () => {
  it('uses a password field that browsers do not autofill', async () => {
    const w = await open()
    const input = w.find('#gh-token')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('new-password')
    expect(input.attributes('spellcheck')).toBe('false')
  })

  it('tells the user the token is never stored and which scopes to grant', async () => {
    const text = (await open()).text()
    expect(text).toMatch(/never stored or logged/)
    expect(text).toMatch(/fine-grained/)
    expect(text).toMatch(/Contents/)
  })

  it('clears the token after a successful push', async () => {
    createRepoAndPush.mockResolvedValue({ owner: 'a', repo: 'r', htmlUrl: 'https://github.com/a/r' })
    const w = await open()
    await w.find('#gh-token').setValue('ghp_secret_value')
    await w.find('button.primary').trigger('click')
    await flushPromises()
    expect(createRepoAndPush).toHaveBeenCalledWith(expect.objectContaining({ token: 'ghp_secret_value' }))
    expect((w.find('#gh-token').element as HTMLInputElement).value).toBe('')
    expect(w.html()).not.toContain('ghp_secret_value')
  })

  it('clears the token after a failed push too, and the error never contains it', async () => {
    createRepoAndPush.mockRejectedValue(new Error('GitHub: Bad credentials (401)'))
    const w = await open()
    await w.find('#gh-token').setValue('ghp_secret_value')
    await w.find('button.primary').trigger('click')
    await flushPromises()
    expect((w.find('#gh-token').element as HTMLInputElement).value).toBe('')
    expect(w.text()).toContain('Bad credentials')
    expect(w.html()).not.toContain('ghp_secret_value')
  })

  it('never writes the token to browser storage', async () => {
    createRepoAndPush.mockResolvedValue({ owner: 'a', repo: 'r', htmlUrl: 'https://github.com/a/r' })
    const w = await open()
    await w.find('#gh-token').setValue('ghp_secret_value')
    await w.find('button.primary').trigger('click')
    await flushPromises()
    for (const [, value] of setItem.mock.calls) expect(String(value)).not.toContain('ghp_secret_value')
    for (const store of [localStorage, sessionStorage]) {
      expect(JSON.stringify({ ...store })).not.toContain('ghp_secret_value')
    }
  })
})
