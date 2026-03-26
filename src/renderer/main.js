import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import nativeApp from './services/nativeApi/app'
import bootstrapRenderer from './bootstrap'
import { RouterView } from 'vue-router'
import './assets/symbolIcon'
import { getInitialState, getRuntime } from './services/runtime'
import { addElementStyle } from '@/util/theme'
import { useAppStore } from '@/stores/app'
import { useAutoUpdatesStore } from '@/stores/autoUpdates'
import { useCommandCenterStore } from '@/stores/commandCenter'
import { useEditorStore } from '@/stores/editor'
import { useLayoutStore } from '@/stores/layout'
import { useListenForMainStore } from '@/stores/listenForMain'
import { useNotificationStore } from '@/stores/notification'
import { usePreferencesStore } from '@/stores/preferences'
import { useProjectStore } from '@/stores/project'
import { useTweetStore } from '@/stores/tweet'

import './assets/styles/index.css'
import './assets/styles/printService.css'

const RootShell = {
  name: 'RendererRootShell',
  render: () => h(RouterView, { class: 'view' })
}

const initializeStores = pinia => {
  const appStore = useAppStore(pinia)
  const autoUpdatesStore = useAutoUpdatesStore(pinia)
  const commandCenterStore = useCommandCenterStore(pinia)
  const editorStore = useEditorStore(pinia)
  const layoutStore = useLayoutStore(pinia)
  const listenForMainStore = useListenForMainStore(pinia)
  const notificationStore = useNotificationStore(pinia)
  const preferencesStore = usePreferencesStore(pinia)
  const projectStore = useProjectStore(pinia)
  const tweetStore = useTweetStore(pinia)
  const initialState = getInitialState()

  if (initialState) {
    preferencesStore.commit('SET_USER_PREFERENCE', initialState)
  }

  appStore.dispatch('LINTEN_WIN_STATUS')
  commandCenterStore.dispatch('LISTEN_COMMAND_CENTER_BUS')
  tweetStore.dispatch('LISTEN_FOR_TWEET')
  layoutStore.dispatch('LISTEN_FOR_LAYOUT')
  listenForMainStore.dispatch('LISTEN_FOR_EDIT')
  preferencesStore.dispatch('LISTEN_FOR_VIEW')
  listenForMainStore.dispatch('LISTEN_FOR_SHOW_DIALOG')
  listenForMainStore.dispatch('LISTEN_FOR_PARAGRAPH_INLINE_STYLE')
  projectStore.dispatch('LISTEN_FOR_UPDATE_PROJECT')
  projectStore.dispatch('LISTEN_FOR_LOAD_PROJECT')
  projectStore.dispatch('LISTEN_FOR_SIDEBAR_CONTEXT_MENU')
  autoUpdatesStore.dispatch('LISTEN_FOR_UPDATE')
  editorStore.dispatch('LISTEN_SCREEN_SHOT')
  preferencesStore.askForUserPreference()
  preferencesStore.dispatch('LISTEN_TOGGLE_VIEW')
  editorStore.dispatch('LISTEN_FOR_CLOSE')
  editorStore.dispatch('LISTEN_FOR_SAVE_AS')
  editorStore.dispatch('LISTEN_FOR_MOVE_TO')
  editorStore.dispatch('LISTEN_FOR_SAVE')
  editorStore.dispatch('LISTEN_FOR_SET_PATHNAME')
  editorStore.dispatch('LISTEN_FOR_BOOTSTRAP_WINDOW')
  editorStore.dispatch('LISTEN_FOR_SAVE_CLOSE')
  editorStore.dispatch('LISTEN_FOR_RENAME')
  editorStore.dispatch('LINTEN_FOR_SET_LINE_ENDING')
  editorStore.dispatch('LINTEN_FOR_SET_ENCODING')
  editorStore.dispatch('LINTEN_FOR_SET_FINAL_NEWLINE')
  editorStore.dispatch('LISTEN_FOR_NEW_TAB')
  editorStore.dispatch('LISTEN_FOR_CLOSE_TAB')
  editorStore.dispatch('LISTEN_FOR_TAB_CYCLE')
  editorStore.dispatch('LISTEN_FOR_SWITCH_TABS')
  editorStore.dispatch('LINTEN_FOR_PRINT_SERVICE_CLEARUP')
  editorStore.dispatch('LINTEN_FOR_EXPORT_SUCCESS')
  editorStore.dispatch('LISTEN_FOR_FILE_CHANGE')
  editorStore.dispatch('LISTEN_WINDOW_ZOOM')
  editorStore.dispatch('LISTEN_FOR_RELOAD_IMAGES')
  editorStore.dispatch('LISTEN_FOR_CONTEXT_MENU')
  notificationStore.dispatch('LISTEN_FOR_NOTIFICATION')
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
  initializeStores(pinia)
  nativeApp.send('mt::renderer-ready')
  app.use(router)

  await router.isReady()
  app.mount('#app')
}

start().catch(error => {
  console.error(error)
  throw error
})
