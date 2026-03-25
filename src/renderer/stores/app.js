import { defineStore } from 'pinia'
import { getRuntime } from '@/services/runtime'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

const createAppState = () => {
  let runtime = { platform: '', appVersion: '' }

  try {
    runtime = getRuntime()
  } catch (_) {
    // Allow Pinia bridge tests to initialize stores without bootstrapping the renderer runtime.
  }

  return {
    platform: runtime.platform,
    appVersion: runtime.appVersion,
    windowActive: true,
    init: false
  }
}

export const useAppStore = defineStore('app', {
  state: createLegacyState(createAppState()),
  actions: {
    ...createLegacyStoreActions(),
    setWinStatus (status) {
      this.windowActive = status
    },
    setInitialized () {
      this.init = true
    }
  }
})
