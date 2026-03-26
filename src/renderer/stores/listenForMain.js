import { defineStore } from 'pinia'
import bus from '@/bus'
import events from '@/services/nativeApi/events'
import { useLayoutStore } from '@/stores/layout'

let areEditListenersBound = false
let areDialogListenersBound = false
let areParagraphListenersBound = false

export const useListenForMainStore = defineStore('listenForMain', {
  state: () => ({}),
  actions: {
    bindEditEvents () {
      if (areEditListenersBound) {
        return
      }

      events.on('mt::editor-edit-action', (event, type) => {
        if (type === 'findInFolder') {
          const layoutStore = useLayoutStore(this.$pinia)
          layoutStore.applyLayout({
            rightColumn: 'search',
            showSideBar: true
          })
        }

        bus.$emit(type, type)
      })

      areEditListenersBound = true
    },
    bindShowDialogEvents () {
      if (areDialogListenersBound) {
        return
      }

      events.on('mt::about-dialog', () => {
        bus.$emit('aboutDialog')
      })

      events.on('mt::show-export-dialog', (event, type) => {
        bus.$emit('showExportDialog', type)
      })

      areDialogListenersBound = true
    },
    bindParagraphInlineStyleEvents () {
      if (areParagraphListenersBound) {
        return
      }

      events.on('mt::editor-paragraph-action', (event, { type }) => {
        bus.$emit('paragraph', type)
      })

      events.on('mt::editor-format-action', (event, { type }) => {
        bus.$emit('format', type)
      })

      areParagraphListenersBound = true
    }
  }
})
