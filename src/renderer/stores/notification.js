import { defineStore } from 'pinia'
import moduleNotification from './modules/notification'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useNotificationStore = defineStore('notification', {
  state: createLegacyState(moduleNotification.state),
  actions: createModuleStoreActions()
})
