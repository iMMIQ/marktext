import { h } from 'vue'
import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import routes from '@/router/routes'

const RouteStub = {
  name: 'RouteStub',
  template: '<div class="route-stub"></div>'
}

const RootShell = {
  name: 'RendererRootShell',
  render: () => h(RouterView, { class: 'view' })
}

const withStubbedComponents = routeRecords => routeRecords.map(route => ({
  ...route,
  component: route.component ? RouteStub : undefined,
  children: route.children ? withStubbedComponents(route.children) : undefined
}))

describe('renderer app shell', () => {
  it('builds a Vue 3 router for the editor shell', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes('editor')
    })

    expect(router.getRoutes().map(route => route.path)).toContain('/editor')
  })

  it('mounts a root router-view shell for the editor route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: withStubbedComponents(routes('editor'))
    })

    await router.push('/editor')
    await router.isReady()

    const wrapper = mount(RootShell, {
      global: {
        plugins: [createPinia(), router]
      }
    })

    expect(wrapper.find('.route-stub').exists()).toBe(true)
  })
})
