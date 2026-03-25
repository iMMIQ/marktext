import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import Preference from '@/pages/preference.vue'
import routes from '@/router/routes'
import { installElementPlus } from '@/plugins/elementPlus'
import { installServices } from '@/plugins/services'

describe('preferences shell', () => {
  it('renders the general preference route with pinia-backed state', async () => {
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
            }
          }
        ]
      }
    })

    expect(wrapper.find('.pref-container').exists()).toBe(true)
  })
})
