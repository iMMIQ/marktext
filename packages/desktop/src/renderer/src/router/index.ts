import type { RouteRecordRaw } from 'vue-router'

const loadGeneralSettings = () => import('@/prefComponents/general/index.vue')

const parseSettingsPage = (type: string | null | undefined): string => {
  let pageUrl = '/preference'
  if (type && /\/spelling$/.test(type)) {
    pageUrl += '/spelling'
  }
  return pageUrl
}

const routes = (type: string | null | undefined): RouteRecordRaw[] => [
  {
    path: '/',
    redirect: type === 'editor' ? '/editor' : parseSettingsPage(type)
  },
  {
    path: '/editor',
    component: () => import('@/pages/app.vue')
  },
  {
    path: '/preference',
    component: () => import('@/pages/preference.vue'),
    children: [
      {
        path: '',
        component: loadGeneralSettings
      },
      {
        path: 'general',
        component: loadGeneralSettings,
        name: 'general'
      },
      {
        path: 'editor',
        component: () => import('@/prefComponents/editor/index.vue'),
        name: 'editor'
      },
      {
        path: 'markdown',
        component: () => import('@/prefComponents/markdown/index.vue'),
        name: 'markdown'
      },
      {
        path: 'spelling',
        component: () => import('@/prefComponents/spellchecker/index.vue'),
        name: 'spelling'
      },
      {
        path: 'theme',
        component: () => import('@/prefComponents/theme/index.vue'),
        name: 'theme'
      },
      {
        path: 'image',
        component: () => import('@/prefComponents/image/index.vue'),
        name: 'image'
      },
      {
        path: 'keybindings',
        component: () => import('@/prefComponents/keybindings/index.vue'),
        name: 'keybindings'
      }
    ]
  }
]

export default routes
