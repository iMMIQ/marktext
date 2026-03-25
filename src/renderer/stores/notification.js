import { defineStore } from 'pinia'
import legacyNotification from '@/store/notification'
import { createLegacyState } from './index'

export const useNotificationStore = defineStore('notification', {
  state: createLegacyState(legacyNotification.state)
})
