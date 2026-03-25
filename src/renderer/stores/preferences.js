import { defineStore } from 'pinia'
import app from '@/services/nativeApi/app'
import events from '@/services/nativeApi/events'
import legacyPreferences from '@/store/preferences'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

let isUserPreferenceListenerBound = false

export const usePreferencesStore = defineStore('preferences', {
  state: createLegacyState(legacyPreferences.state),
  actions: {
    ...createLegacyStoreActions(),
    askForUserPreference () {
      if (!isUserPreferenceListenerBound) {
        events.on('mt::user-preference', (e, preferences) => {
          this.setUserPreference(preferences)
        })
        isUserPreferenceListenerBound = true
      }

      app.send('mt::ask-for-user-preference')
      app.send('mt::ask-for-user-data')
    },
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
    setUserData ({ type, value }) {
      if (Object.prototype.hasOwnProperty.call(this.$state, type)) {
        this[type] = value
      }
      app.send('mt::set-user-data', { [type]: value })
    },
    setImageFolderPath (value) {
      if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(this.$state, 'imageFolderPath')) {
        this.imageFolderPath = value
      }
      app.send('mt::ask-for-modify-image-folder-path', value)
    },
    selectDefaultDirectoryToOpen () {
      app.send('mt::select-default-directory-to-open')
    },
    toggleViewMode (entryName) {
      this[entryName] = !this[entryName]
    }
  }
})
