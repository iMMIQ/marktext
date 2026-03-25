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
})
