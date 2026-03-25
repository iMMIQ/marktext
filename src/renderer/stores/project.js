import { defineStore } from 'pinia'
import legacyProject from '@/store/project'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useProjectStore = defineStore('project', {
  state: createLegacyState(legacyProject.state),
  actions: createLegacyStoreActions()
})
