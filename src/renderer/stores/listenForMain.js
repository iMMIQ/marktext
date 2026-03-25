import { defineStore } from 'pinia'
import legacyListenForMain from '@/store/listenForMain'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useListenForMainStore = defineStore('listenForMain', {
  state: createLegacyState(legacyListenForMain.state),
  actions: createLegacyStoreActions()
})
