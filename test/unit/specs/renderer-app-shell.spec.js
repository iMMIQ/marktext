import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import routes from '@/router/routes'

describe('renderer app shell', () => {
  it('builds a Vue 3 router for the editor shell', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes('editor')
    })

    expect(router.getRoutes().map(route => route.path)).toContain('/editor')
  })
})
