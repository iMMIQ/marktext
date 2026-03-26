import { getActivePinia } from 'pinia'
import events from '@/services/nativeApi/events'
import moduleAutoUpdates from './modules/autoUpdates'
import moduleCommandCenter from './modules/commandCenter'
import moduleEditor from './modules/editor'
import moduleLayout from './modules/layout'
import moduleListenForMain from './modules/listenForMain'
import moduleNotification from './modules/notification'
import modulePreferences from './modules/preferences'
import moduleProject from './modules/project'
import moduleTweet from './modules/tweet'

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

const storeDefinitions = {
  app: rootDefinition,
  autoUpdates: moduleAutoUpdates,
  commandCenter: moduleCommandCenter,
  editor: moduleEditor,
  layout: moduleLayout,
  listenForMain: moduleListenForMain,
  notification: moduleNotification,
  preferences: modulePreferences,
  project: moduleProject,
  tweet: moduleTweet
}

const actionMap = new Map()
const mutationMap = new Map()

Object.entries(storeDefinitions).forEach(([scope, definition]) => {
  Object.entries(definition.actions || {}).forEach(([type, action]) => {
    actionMap.set(type, { scope, action })
  })
  Object.entries(definition.mutations || {}).forEach(([type, mutation]) => {
    mutationMap.set(type, { scope, mutation })
  })
})

const getStoreState = (pinia, scope) => {
  const state = pinia.state.value[scope]
  if (!state) {
    throw new Error(`Pinia store "${scope}" is not initialized`)
  }

  return state
}

const createRootState = pinia => new Proxy({}, {
  get (_, key) {
    if (key !== 'app' && Object.prototype.hasOwnProperty.call(storeDefinitions, key)) {
      return getStoreState(pinia, key)
    }

    return (pinia.state.value.app || {})[key]
  },
  ownKeys () {
    return [
      ...Object.keys(pinia.state.value.app || {}),
      ...Object.keys(storeDefinitions)
    ]
  },
  getOwnPropertyDescriptor () {
    return { enumerable: true, configurable: true }
  }
})

const commitStoreMutation = (pinia, type, payload) => {
  const entry = mutationMap.get(type)
  if (!entry) {
    throw new Error(`Unknown store mutation: ${type}`)
  }

  entry.mutation(getStoreState(pinia, entry.scope), payload)
}

const dispatchStoreAction = async (pinia, type, payload) => {
  const entry = actionMap.get(type)
  if (!entry) {
    throw new Error(`Unknown store action: ${type}`)
  }

  const context = {
    state: getStoreState(pinia, entry.scope),
    rootState: createRootState(pinia),
    getters: {},
    rootGetters: {},
    commit: (mutationType, mutationPayload) => commitStoreMutation(pinia, mutationType, mutationPayload),
    dispatch: (actionType, actionPayload) => dispatchStoreAction(pinia, actionType, actionPayload)
  }

  return entry.action(context, payload)
}

const createModuleStoreActions = () => ({
  dispatch (type, payload) {
    return dispatchStoreAction(this.$pinia || getActivePinia(), type, payload)
  },
  commit (type, payload) {
    return commitStoreMutation(this.$pinia || getActivePinia(), type, payload)
  }
})

export {
  commitStoreMutation,
  createModuleStoreActions,
  createRootState,
  dispatchStoreAction,
  storeDefinitions
}
