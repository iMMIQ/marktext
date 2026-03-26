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

  it('returns an empty font list when fontmanager cannot be loaded', async () => {
    const { listFontFamilies, setFontManagerLoader } = await import('../../../src/main/native/fontManager')
    setFontManagerLoader(() => {
      throw new Error('native load failed')
    })

    await expect(listFontFamilies({ onlyMonospace: true })).resolves.toEqual([])
  })

  it('returns neutral keyboard fallbacks when native-keymap cannot be loaded', async () => {
    const { getCurrentKeyboardInfo, setNativeKeymapLoader, subscribeToKeyboardLayoutChange } = await import('../../../src/main/native/nativeKeymap')
    setNativeKeymapLoader(() => {
      throw new Error('native load failed')
    })

    expect(getCurrentKeyboardInfo()).toEqual({
      layout: '',
      keymap: {}
    })
    expect(typeof subscribeToKeyboardLayoutChange(() => {})).toBe('function')
  })
})
