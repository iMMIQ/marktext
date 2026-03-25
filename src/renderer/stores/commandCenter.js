import { defineStore } from 'pinia'
import legacyCommandCenter from '@/store/commandCenter'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useCommandCenterStore = defineStore('commandCenter', {
  state: createLegacyState(legacyCommandCenter.state),
  actions: createLegacyStoreActions()
})
