import { createRouter, createWebHashHistory } from 'vue-router'
import routes from './routes'

const createRendererRouter = type => createRouter({
  history: createWebHashHistory(),
  routes: routes(type)
})

export default createRendererRouter
