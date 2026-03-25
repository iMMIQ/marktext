import { defineStore } from 'pinia'
import legacyListenForMain from '@/store/listenForMain'
import { createLegacyState } from './index'

export const useListenForMainStore = defineStore('listenForMain', {
  state: createLegacyState(legacyListenForMain.state)
})
