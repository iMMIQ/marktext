import { defineStore } from 'pinia'
import notice from '@/services/notification'
import events from '@/services/nativeApi/events'
import shell from '@/services/nativeApi/shell'

let isNotificationListenerBound = false

export const useNotificationStore = defineStore('notification', {
  state: () => ({}),
  actions: {
    bindNotificationEvents () {
      if (isNotificationListenerBound) {
        return
      }

      const defaultOptions = {
        title: 'Infomation',
        type: 'primary',
        time: 10000,
        message: 'You should never see this message'
      }

      events.on('mt::show-notification', (event, opts) => {
        notice.notify(Object.assign({}, defaultOptions, opts))
      })

      events.on('mt::pandoc-not-exists', async (event, opts) => {
        const options = Object.assign({}, defaultOptions, opts, { showConfirm: true })
        await notice.notify(options)
        shell.openExternal('http://pandoc.org')
      })

      isNotificationListenerBound = true
    }
  }
})
