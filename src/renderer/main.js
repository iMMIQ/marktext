import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import appApi from './services/nativeApi/app'
import bootstrapRenderer from './bootstrap'
import LocaleProvider from './components/localeProvider.vue'
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
import { markRendererStartupPhase } from './performance/startupMetrics'

import './assets/styles/index.css'
import './assets/styles/printService.css'

markRendererStartupPhase('renderer:module-evaluated')

const RootShell = {
  name: 'RendererRootShell',
  render: () => h(LocaleProvider)
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
  markRendererStartupPhase('renderer:start')
  await bootstrapRenderer()
  markRendererStartupPhase('renderer:bootstrap-complete')
  addElementStyle()
  markRendererStartupPhase('renderer:element-style-added')

  const [
    { default: createRendererRouter },
    { createRendererI18n, installLegacyTranslator },
    { installElementPlus },
    { installServices }
  ] = await Promise.all([
    import('./router'),
    import('./i18n'),
    import('./plugins/elementPlus'),
    import('./plugins/services')
  ])
  markRendererStartupPhase('renderer:imports-complete')

  const app = createApp(RootShell)
  const pinia = createPinia()
  const router = createRendererRouter(getRuntime().env.type)
  const i18n = createRendererI18n(getInitialState()?.language)

  installElementPlus(app)
  installServices(app)
  installLegacyTranslator(app)
  app.use(i18n)
  app.use(pinia)
  markRendererStartupPhase('renderer:stores-init-start')
  initializeStores(pinia)
  markRendererStartupPhase('renderer:stores-init-complete')
  if (getRuntime().env.type === 'editor') {
    appApi.notifyRendererReady()
    markRendererStartupPhase('renderer:notify-ready')
  }
  app.use(router)

  markRendererStartupPhase('renderer:router-ready-start')
  await router.isReady()
  markRendererStartupPhase('renderer:router-ready-complete')
  markRendererStartupPhase('renderer:mount-start')
  app.mount('#app')
  markRendererStartupPhase('renderer:mount-complete')
  requestAnimationFrame(() => {
    markRendererStartupPhase('renderer:first-frame')
  })
}

start().catch(error => {
  console.error(error)
  throw error
})
