import { defineStore } from 'pinia'
import moduleAutoUpdates from './modules/autoUpdates'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: createLegacyState(moduleAutoUpdates.state),
  actions: createModuleStoreActions()
})
