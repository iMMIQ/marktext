import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

describe('pinia direct store actions', () => {
  it('boots preferences with direct methods instead of string dispatch', async () => {
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

    preferences.applyPreferences({ theme: 'dark' })

    expect(preferences.theme).toBe('dark')
    expect(typeof preferences.dispatch).toBe('undefined')
    expect(typeof preferences.commit).toBe('undefined')
  })
})
