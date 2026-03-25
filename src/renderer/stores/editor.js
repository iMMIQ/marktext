import { defineStore } from 'pinia'
import moduleEditor from './modules/editor'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useEditorStore = defineStore('editor', {
  state: createLegacyState(moduleEditor.state),
  actions: {
    ...createModuleStoreActions(),
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
