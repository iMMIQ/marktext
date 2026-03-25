import { defineStore } from 'pinia'
import moduleListenForMain from './modules/listenForMain'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useListenForMainStore = defineStore('listenForMain', {
  state: createLegacyState(moduleListenForMain.state),
  actions: createModuleStoreActions()
})
