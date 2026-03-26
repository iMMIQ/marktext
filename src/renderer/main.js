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
    preferencesStore.applyPreferences(initialState)
  }

  appStore.bindWindowStatusListener()
  commandCenterStore.bindCommandCenterBus()
  tweetStore.bindTweetEvents()
  layoutStore.bindLayoutEvents()
  listenForMainStore.bindEditEvents()
  preferencesStore.bindViewEvents()
  listenForMainStore.bindShowDialogEvents()
  listenForMainStore.bindParagraphInlineStyleEvents()
  projectStore.bindUpdateProjectEvents()
  projectStore.bindLoadProjectEvents()
  projectStore.bindSidebarContextMenu()
  autoUpdatesStore.bindUpdateEvents()
  editorStore.bindScreenShot()
  preferencesStore.askForUserPreference()
  preferencesStore.bindToggleViewEvents()
  editorStore.bindClose()
  editorStore.bindSaveAs()
  editorStore.bindMoveTo()
  editorStore.bindSave()
  editorStore.bindSetPathname()
  editorStore.bindBootstrapWindow()
  editorStore.bindSaveClose()
  editorStore.bindRename()
  editorStore.bindSetLineEnding()
  editorStore.bindSetEncoding()
  editorStore.bindSetFinalNewline()
  editorStore.bindNewTabEvents()
  editorStore.bindCloseTabEvents()
  editorStore.bindTabCycleEvents()
  editorStore.bindSwitchTabsEvents()
  editorStore.bindPrintServiceCleanup()
  editorStore.bindExportSuccess()
  editorStore.bindFileChange()
  editorStore.bindWindowZoom()
  editorStore.bindReloadImages()
  editorStore.bindContextMenu()
  notificationStore.bindNotificationEvents()
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
