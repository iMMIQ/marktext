import { storeKey } from 'vuex'
import events from '@/services/nativeApi/events'
import legacyAutoUpdates from '@/store/autoUpdates'
import legacyCommandCenter from '@/store/commandCenter'
import legacyEditor from '@/store/editor'
import legacyLayout from '@/store/layout'
import legacyListenForMain from '@/store/listenForMain'
import legacyNotification from '@/store/notification'
import legacyPreferences from '@/store/preferences'
import legacyProject from '@/store/project'
import legacyTweet from '@/store/tweet'
import { useAppStore } from './app'
import { useAutoUpdatesStore } from './autoUpdates'
import { useCommandCenterStore } from './commandCenter'
import { useEditorStore } from './editor'
import { useLayoutStore } from './layout'
import { useListenForMainStore } from './listenForMain'
import { useNotificationStore } from './notification'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import { useTweetStore } from './tweet'

const rootDefinition = {
  mutations: {
    SET_WIN_STATUS (state, status) {
      state.windowActive = status
    },
    SET_INITIALIZED (state) {
      state.init = true
    }
  },
  actions: {
    LINTEN_WIN_STATUS ({ commit }) {
      events.on('mt::window-active-status', (e, { status }) => {
        commit('SET_WIN_STATUS', status)
      })
    },
    SEND_INITIALIZED ({ commit }) {
      commit('SET_INITIALIZED')
    }
  }
}

const createLegacyStoreBridge = pinia => {
  const appStore = useAppStore(pinia)
  const moduleStores = {
    autoUpdates: useAutoUpdatesStore(pinia),
    commandCenter: useCommandCenterStore(pinia),
    editor: useEditorStore(pinia),
    layout: useLayoutStore(pinia),
    listenForMain: useListenForMainStore(pinia),
    notification: useNotificationStore(pinia),
    preferences: usePreferencesStore(pinia),
    project: useProjectStore(pinia),
    tweet: useTweetStore(pinia)
  }

  const definitions = {
    app: rootDefinition,
    autoUpdates: legacyAutoUpdates,
    commandCenter: legacyCommandCenter,
    editor: legacyEditor,
    layout: legacyLayout,
    listenForMain: legacyListenForMain,
    notification: legacyNotification,
    preferences: legacyPreferences,
    project: legacyProject,
    tweet: legacyTweet
  }

  const actionMap = new Map()
  const mutationMap = new Map()

  Object.entries(definitions).forEach(([scope, definition]) => {
    Object.entries(definition.actions || {}).forEach(([type, action]) => {
      actionMap.set(type, { scope, action })
    })
    Object.entries(definition.mutations || {}).forEach(([type, mutation]) => {
      mutationMap.set(type, { scope, mutation })
    })
  })

  const state = new Proxy({}, {
    get (_, key) {
      if (key in moduleStores) {
        return moduleStores[key].$state
      }
      return appStore.$state[key]
    },
    ownKeys () {
      return [...Object.keys(appStore.$state), ...Object.keys(moduleStores)]
    },
    getOwnPropertyDescriptor () {
      return { enumerable: true, configurable: true }
    }
  })

  const commit = (type, payload) => {
    const entry = mutationMap.get(type)
    if (!entry) {
      throw new Error(`Unknown legacy mutation: ${type}`)
    }

    const targetState = entry.scope === 'app' ? appStore.$state : moduleStores[entry.scope].$state
    entry.mutation(targetState, payload)
  }

  const dispatch = async (type, payload) => {
    if (type === 'SET_SINGLE_PREFERENCE') {
      return moduleStores.preferences.setSinglePreference(payload)
    }

    const entry = actionMap.get(type)
    if (!entry) {
      throw new Error(`Unknown legacy action: ${type}`)
    }

    const localState = entry.scope === 'app' ? appStore.$state : moduleStores[entry.scope].$state
    const context = {
      state: localState,
      rootState: state,
      getters: {},
      rootGetters: {},
      commit,
      dispatch
    }

    return entry.action(context, payload)
  }

  const bridge = {
    state,
    getters: {},
    commit,
    dispatch,
    install (app) {
      app.config.globalProperties.$store = bridge
      app.provide(storeKey, bridge)
    }
  }

  return bridge
}

export {
  createLegacyStoreBridge
}
