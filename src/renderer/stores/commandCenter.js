import { defineStore } from 'pinia'
import legacyCommandCenter from '@/store/commandCenter'
import { createLegacyState } from './index'

export const useCommandCenterStore = defineStore('commandCenter', {
  state: createLegacyState(legacyCommandCenter.state)
})
