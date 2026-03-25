import { defineStore } from 'pinia'
import moduleProject from './modules/project'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useProjectStore = defineStore('project', {
  state: createLegacyState(moduleProject.state),
  actions: createModuleStoreActions()
})
