import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

describe('pinia store dispatch contract', () => {
  it('routes string-based preference updates through the preferences store', async () => {
    if (typeof globalThis.localStorage !== 'object' || typeof globalThis.localStorage.getItem !== 'function') {
      globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
      }
    }

    const { usePreferencesStore } = await import('@/stores/preferences')

    const pinia = createPinia()
    setActivePinia(pinia)
    const preferences = usePreferencesStore(pinia)

    await preferences.dispatch('SET_SINGLE_PREFERENCE', { type: 'theme', value: 'dark' })

    expect(preferences.theme).toBe('dark')
  })

  it('routes root app actions through cross-store dispatch', async () => {
    const [{ useAppStore }, { useEditorStore }] = await Promise.all([
      import('@/stores/app'),
      import('@/stores/editor')
    ])

    const pinia = createPinia()
    setActivePinia(pinia)
    const appStore = useAppStore(pinia)
    const editorStore = useEditorStore(pinia)

    expect(appStore.init).toBe(false)

    await editorStore.dispatch('SEND_INITIALIZED')

    expect(appStore.init).toBe(true)
  })
})
