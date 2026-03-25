import { defineStore } from 'pinia'
import app from '@/services/nativeApi/app'
import legacyPreferences from '@/store/preferences'
import { createLegacyState } from './index'

export const usePreferencesStore = defineStore('preferences', {
  state: createLegacyState(legacyPreferences.state),
  actions: {
    setSinglePreference ({ type, value }) {
      if (Object.prototype.hasOwnProperty.call(this.$state, type)) {
        this[type] = value
      }
      app.send('mt::set-user-preference', { [type]: value })
    },
    setUserPreference (preference) {
      Object.keys(preference).forEach(key => {
        if (typeof preference[key] !== 'undefined' && Object.prototype.hasOwnProperty.call(this.$state, key)) {
          this[key] = preference[key]
        }
      })
    },
    toggleViewMode (entryName) {
      this[entryName] = !this[entryName]
    }
  }
})
