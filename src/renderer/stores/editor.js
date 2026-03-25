import { defineStore } from 'pinia'
import legacyEditor from '@/store/editor'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useEditorStore = defineStore('editor', {
  state: createLegacyState(legacyEditor.state),
  actions: {
    ...createLegacyStoreActions(),
    consumeCurrentTabNotification (status) {
      const notifications = this.currentFile?.notifications
      if (!notifications || notifications.length === 0) {
        return
      }

      const item = notifications.shift()
      item?.action?.(status)
    }
  }
})
