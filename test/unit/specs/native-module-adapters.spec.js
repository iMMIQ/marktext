import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('keytar')
})

describe('native adapters', () => {
  it('returns neutral fallbacks when keytar cannot be loaded', async () => {
    vi.doMock('keytar', () => ({
      default: false
    }))

    const { getPassword, setPassword } = await import('../../../src/main/native/keytar')

    await expect(getPassword('marktext', 'githubToken')).resolves.toBe('')
    await expect(setPassword('marktext', 'githubToken', 'token')).resolves.toBe(false)
  })
})
