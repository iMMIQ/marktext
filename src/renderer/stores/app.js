import { defineStore } from 'pinia'
import events from '@/services/nativeApi/events'
import { getRuntime } from '@/services/runtime'

let isWindowStatusListenerBound = false

const createAppState = () => {
  let runtime = { platform: '', appVersion: '' }

  try {
    runtime = getRuntime()
  } catch (_) {
    // Allow tests to initialize stores without bootstrapping the renderer runtime.
  }

  return {
    platform: runtime.platform,
    appVersion: runtime.appVersion,
    windowActive: true,
    init: false
  }
}

export const useAppStore = defineStore('app', {
  state: createAppState,
  actions: {
    bindWindowStatusListener () {
      if (isWindowStatusListenerBound) {
        return
      }

      events.on('mt::window-active-status', (event, { status }) => {
        this.windowActive = status
      })
      isWindowStatusListenerBound = true
    },
    markInitialized () {
      this.init = true
    }
  }
})
