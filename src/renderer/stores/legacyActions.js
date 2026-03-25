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

const legacyDefinitions = {
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

Object.entries(legacyDefinitions).forEach(([scope, definition]) => {
  Object.entries(definition.actions || {}).forEach(([type, action]) => {
    actionMap.set(type, { scope, action })
  })
  Object.entries(definition.mutations || {}).forEach(([type, mutation]) => {
    mutationMap.set(type, { scope, mutation })
  })
})

const getModuleState = (pinia, scope) => {
  const state = pinia.state.value[scope]
  if (!state) {
    throw new Error(`Pinia store "${scope}" is not initialized`)
  }

  return state
}

const createLegacyRootState = pinia => new Proxy({}, {
  get (_, key) {
    if (key !== 'app' && Object.prototype.hasOwnProperty.call(legacyDefinitions, key)) {
      return getModuleState(pinia, key)
    }

    return getModuleState(pinia, 'app')[key]
  },
  ownKeys () {
    return [
      ...Object.keys(getModuleState(pinia, 'app')),
      ...Object.keys(legacyDefinitions).filter(scope => scope !== 'app')
    ]
  },
  getOwnPropertyDescriptor () {
    return { enumerable: true, configurable: true }
  }
})

const commitLegacyMutation = (pinia, type, payload) => {
  const entry = mutationMap.get(type)
  if (!entry) {
    throw new Error(`Unknown legacy mutation: ${type}`)
  }

  const targetState = getModuleState(pinia, entry.scope)
  entry.mutation(targetState, payload)
}

const dispatchLegacyAction = async (pinia, type, payload) => {
  const entry = actionMap.get(type)
  if (!entry) {
    throw new Error(`Unknown legacy action: ${type}`)
  }

  const context = {
    state: getModuleState(pinia, entry.scope),
    rootState: createLegacyRootState(pinia),
    getters: {},
    rootGetters: {},
    commit: (mutationType, mutationPayload) => commitLegacyMutation(pinia, mutationType, mutationPayload),
    dispatch: (actionType, actionPayload) => dispatchLegacyAction(pinia, actionType, actionPayload)
  }

  return entry.action(context, payload)
}

const createLegacyStoreActions = () => ({
  dispatch (type, payload) {
    return dispatchLegacyAction(this.$pinia, type, payload)
  },
  commit (type, payload) {
    return commitLegacyMutation(this.$pinia, type, payload)
  }
})

export {
  createLegacyRootState,
  createLegacyStoreActions,
  commitLegacyMutation,
  dispatchLegacyAction,
  legacyDefinitions,
  rootDefinition
}
