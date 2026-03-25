import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import bootstrapRenderer from './bootstrap'
import { RouterView } from 'vue-router'
import './assets/symbolIcon'
import { getRuntime } from './services/runtime'
import { addElementStyle } from '@/util/theme'

import './assets/styles/index.css'
import './assets/styles/printService.css'

const RootShell = {
  name: 'RendererRootShell',
  render: () => h(RouterView, { class: 'view' })
}

const start = async () => {
  await bootstrapRenderer()
  addElementStyle()

  const [
    { default: createRendererRouter },
    { installElementPlus },
    { installServices }
  ] = await Promise.all([
    import('./router'),
    import('./plugins/elementPlus'),
    import('./plugins/services')
  ])

  const app = createApp(RootShell)
  const pinia = createPinia()
  const router = createRendererRouter(getRuntime().env.type)

  installElementPlus(app)
  installServices(app)
  app.use(pinia)
  app.use(router)

  await router.isReady()
  app.mount('#app')
}

start().catch(error => {
  console.error(error)
  throw error
})
