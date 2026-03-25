import { defineStore } from 'pinia'
import legacyAutoUpdates from '@/store/autoUpdates'
import { createLegacyState } from './index'

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: createLegacyState(legacyAutoUpdates.state)
})
