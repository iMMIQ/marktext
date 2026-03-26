import { defineStore } from 'pinia'
import notice from '@/services/notification'
import appApi from '@/services/nativeApi/app'
import events from '@/services/nativeApi/events'

let isUpdateListenerBound = false

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: () => ({}),
  actions: {
    bindUpdateEvents () {
      if (isUpdateListenerBound) {
        return
      }

      events.on('mt::UPDATE_ERROR', (event, message) => {
        notice.notify({
          title: 'Update',
          type: 'error',
          time: 10000,
          message
        })
      })

      events.on('mt::UPDATE_NOT_AVAILABLE', (event, message) => {
        notice.notify({
          title: 'Update not Available',
          type: 'primary',
          message
        })
      })

      events.on('mt::UPDATE_DOWNLOADED', (event, message) => {
        notice.notify({
          title: 'Update Downloaded',
          type: 'info',
          message
        })
      })

      events.on('mt::UPDATE_AVAILABLE', (event, message) => {
        notice.notify({
          title: 'Update Available',
          type: 'primary',
          message,
          showConfirm: true
        })
          .then(() => {
            appApi.notifyNeedUpdate({ needUpdate: true })
          })
          .catch(() => {
            appApi.notifyNeedUpdate({ needUpdate: false })
          })
      })

      isUpdateListenerBound = true
    }
  }
})
