import { defineStore } from 'pinia'
import moduleLayout from './modules/layout'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useLayoutStore = defineStore('layout', {
  state: createLegacyState(moduleLayout.state),
  actions: createModuleStoreActions()
})
