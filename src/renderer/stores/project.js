import { defineStore } from 'pinia'
import legacyProject from '@/store/project'
import { createLegacyState } from './index'

export const useProjectStore = defineStore('project', {
  state: createLegacyState(legacyProject.state)
})
