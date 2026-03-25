import { configureCompat, createApp, h } from 'vue'
import bootstrapRenderer from './bootstrap'
import { RouterView } from 'vue-router'
import { createStore } from 'vuex'
import './assets/symbolIcon'
import { getRuntime } from './services/runtime'
import { addElementStyle } from '@/util/theme'

import './assets/styles/index.css'
import './assets/styles/printService.css'

configureCompat({ MODE: 2 })

const RootShell = {
  name: 'RendererRootShell',
  render: () => h(RouterView, { class: 'view' })
}

const start = async () => {
  await bootstrapRenderer()
  addElementStyle()

  const [
    { default: storeOptions },
    { default: createRendererRouter },
    { installElementPlus },
    { installServices }
  ] = await Promise.all([
    import('./store'),
    import('./router'),
    import('./plugins/elementPlus'),
    import('./plugins/services')
  ])

  const app = createApp(RootShell)
  const store = createStore(storeOptions)
  const router = createRendererRouter(getRuntime().env.type)

  installElementPlus(app)
  installServices(app)
  app.use(store)
  app.use(router)

  await router.isReady()
  app.mount('#app')
}

start().catch(error => {
  console.error(error)
  throw error
})
