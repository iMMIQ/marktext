import { defineStore } from 'pinia'
import legacyNotification from '@/store/notification'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useNotificationStore = defineStore('notification', {
  state: createLegacyState(legacyNotification.state),
  actions: createLegacyStoreActions()
})
