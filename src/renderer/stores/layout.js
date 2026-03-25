import { defineStore } from 'pinia'
import legacyLayout from '@/store/layout'
import { createLegacyState } from './index'

export const useLayoutStore = defineStore('layout', {
  state: createLegacyState(legacyLayout.state)
})
