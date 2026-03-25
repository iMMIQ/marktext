import { defineStore } from 'pinia'
import events from '@/services/nativeApi/events'
import { getRuntime } from '@/services/runtime'
import { createLegacyState } from './index'

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
    dispatch (type, payload) {
      if (typeof this[type] !== 'function') {
        throw new Error(`Unknown app action: ${type}`)
      }
      return this[type](payload)
    },
    commit (type, payload) {
      if (typeof this[type] !== 'function') {
        throw new Error(`Unknown app mutation: ${type}`)
      }
      return this[type](payload)
    },
    LINTEN_WIN_STATUS () {
      events.on('mt::window-active-status', (e, { status }) => {
        this.SET_WIN_STATUS(status)
      })
    },
    SEND_INITIALIZED () {
      this.SET_INITIALIZED()
    },
    SET_WIN_STATUS (status) {
      this.setWinStatus(status)
    },
    SET_INITIALIZED () {
      this.setInitialized()
    },
    setWinStatus (status) {
      this.windowActive = status
    },
    setInitialized () {
      this.init = true
    }
  }
})
