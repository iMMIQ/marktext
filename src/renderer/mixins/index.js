import { isSamePathSync } from 'common/filesystem/paths'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { useEventBus } from '@/composables/useEventBus'
import bus from '../bus'

export const tabsMixins = {
  methods: {
    selectFile (file) {
      const editorStore = useEditorStore()
      if (file.id !== this.currentFile.id) {
        editorStore.dispatch('UPDATE_CURRENT_FILE', file)
      }
    },
    removeFileInTab (file) {
      const editorStore = useEditorStore()
      const { isSaved } = file
      if (isSaved) {
        editorStore.dispatch('FORCE_CLOSE_TAB', file)
      } else {
        editorStore.dispatch('CLOSE_UNSAVED_TAB', file)
      }
    }
  }
}

export const loadingPageMixins = {
  methods: {
    hideLoadingPage () {
      const loadingPage = document.querySelector('#loading-page')
      if (loadingPage) {
        loadingPage.remove()
      }
    }
  }
}

export const fileMixins = {
  methods: {
    handleSearchResultClick (searchMatch) {
      const editorStore = useEditorStore()
      const eventBus = useEventBus()
      const { range } = searchMatch
      const { filePath } = this.searchResult

      const openedTab = this.tabs.find(file => isSamePathSync(file.pathname, filePath))
      const cursor = {
        isCollapsed: range[0][0] !== range[1][0],
        anchor: {
          line: range[0][0],
          ch: range[0][1]
        },
        focus: {
          line: range[1][0],
          ch: range[1][1]
        }
      }

      if (openedTab) {
        openedTab.cursor = cursor
        if (this.currentFile !== openedTab) {
          editorStore.dispatch('UPDATE_CURRENT_FILE', openedTab)
        } else {
          const { id, markdown, cursor, history } = this.currentFile
          eventBus.$emit('file-changed', { id, markdown, cursor, renderCursor: true, history })
        }
      } else {
        this.$nativeApi.app.send('mt::open-file', filePath, {
          cursor
        })
      }
    },
    handleFileClick () {
      const editorStore = useEditorStore()
      const { isMarkdown, pathname } = this.file
      if (!isMarkdown) return
      const openedTab = this.tabs.find(file => isSamePathSync(file.pathname, pathname))
      if (openedTab) {
        if (this.currentFile === openedTab) {
          return
        }
        editorStore.dispatch('UPDATE_CURRENT_FILE', openedTab)
      } else {
        this.$nativeApi.app.send('mt::open-file', pathname, {})
      }
    }
  }
}

export const createFileOrDirectoryMixins = {
  methods: {
    handleInputFocus () {
      this.$nextTick(() => {
        if (this.$refs.input) {
          this.$refs.input.focus()
          this.createName = ''
          if (this.folder) {
            this.folder.isCollapsed = false
          }
        }
      })
    },
    handleInputEnter () {
      const projectStore = useProjectStore()
      const { createName } = this
      projectStore.dispatch('CREATE_FILE_DIRECTORY', createName)
    }
  }
}
