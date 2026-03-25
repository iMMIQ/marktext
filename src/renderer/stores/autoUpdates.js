import { defineStore } from 'pinia'
import legacyAutoUpdates from '@/store/autoUpdates'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: createLegacyState(legacyAutoUpdates.state),
  actions: createLegacyStoreActions()
})
