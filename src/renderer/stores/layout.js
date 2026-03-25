import { defineStore } from 'pinia'
import legacyLayout from '@/store/layout'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useLayoutStore = defineStore('layout', {
  state: createLegacyState(legacyLayout.state),
  actions: createLegacyStoreActions()
})
