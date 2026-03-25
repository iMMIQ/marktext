import { defineStore } from 'pinia'
import moduleCommandCenter from './modules/commandCenter'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useCommandCenterStore = defineStore('commandCenter', {
  state: createLegacyState(moduleCommandCenter.state),
  actions: createModuleStoreActions()
})
