import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

describe('pinia legacy bridge', () => {
  it('maps legacy dispatch calls onto pinia actions', async () => {
    if (typeof globalThis.localStorage !== 'object' || typeof globalThis.localStorage.getItem !== 'function') {
      globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
      }
    }

    const [{ createLegacyStoreBridge }, { usePreferencesStore }] = await Promise.all([
      import('@/stores/legacyBridge'),
      import('@/stores/preferences')
    ])

    setActivePinia(createPinia())
    const bridge = createLegacyStoreBridge()
    const preferences = usePreferencesStore()

    await bridge.dispatch('SET_SINGLE_PREFERENCE', { type: 'theme', value: 'dark' })

    expect(preferences.theme).toBe('dark')
    expect(bridge.state.preferences.theme).toBe('dark')
  })
})
