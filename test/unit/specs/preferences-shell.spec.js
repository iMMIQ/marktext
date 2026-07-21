import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { installElementPlus } from '@/plugins/elementPlus'
import { installServices } from '@/plugins/services'
import { createRendererI18n, installLegacyTranslator } from '@/i18n'

describe('preferences shell', () => {
  it('renders the general preference route with pinia-backed state', async () => {
    if (typeof globalThis.localStorage !== 'object' || typeof globalThis.localStorage.getItem !== 'function') {
      globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
      }
    }

    const [{ default: Preference }, { default: routes }] = await Promise.all([
      import('@/pages/preference.vue'),
      import('@/router/routes')
    ])

    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes('preferences')
    })

    await router.push('/preference/general')
    await router.isReady()

    const wrapper = mount(Preference, {
      global: {
        plugins: [
          createPinia(),
          router,
          {
            install (app) {
              installElementPlus(app)
              installServices(app)
              installLegacyTranslator(app)
              app.use(createRendererI18n('en'))
            }
          }
        ]
      }
    })

    expect(wrapper.find('.pref-container').exists()).toBe(true)
  }, 10000)
})
