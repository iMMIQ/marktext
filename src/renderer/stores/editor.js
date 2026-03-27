import path from 'path'
import equal from 'fast-deep-equal'
import { defineStore } from 'pinia'
import { isSamePathSync } from 'common/filesystem/paths'
import bus from '@/bus'
import { hasKeys, getUniqueId } from '@/util'
import listToTree from '@/util/listToTree'
import { createDocumentState, getOptionsFromState, getSingleFileState, getBlankFileState } from '@/stores/helpers/editorDocuments'
import notice from '@/services/notification'
import appApi from '@/services/nativeApi/app'
import clipboard from '@/services/nativeApi/clipboard'
import events from '@/services/nativeApi/events'
import shell from '@/services/nativeApi/shell'
import nativeWindow from '@/services/nativeApi/window'
import { getRuntime } from '@/services/runtime'
import {
  FileEncodingCommand,
  LineEndingCommand,
  QuickOpenCommand,
  TrailingNewlineCommand
} from '@/commands'
import { useAppStore } from '@/stores/app'
import { useLayoutStore } from '@/stores/layout'
import { usePreferencesStore } from '@/stores/preferences'
import { useProjectStore } from '@/stores/project'

const autoSaveTimers = new Map()
const MENU_UPDATE_THROTTLE_MS = 50
let pendingSelectionMenuState = null
let pendingSelectionFormatState = null
let selectionMenuReportTimer = null
let selectionFormatReportTimer = null
let lastSelectionMenuState = null
let lastSelectionFormatState = null

const createEditorState = () => ({
  currentFile: {},
  tabs: [],
  listToc: [],
  toc: []
})

const getRootFolderFromProjectStore = projectStore => {
  const openedFolder = projectStore.projectTree
  if (openedFolder) {
    return openedFolder.pathname
  }
  return ''
}

const adjustTrailingNewlines = (markdown, trimTrailingNewlineOption) => {
  if (!markdown) {
    return ''
  }

  switch (trimTrailingNewlineOption) {
    case 0:
      return trimTrailingNewlines(markdown)
    case 1: {
      const lastIndex = markdown.length - 1
      if (markdown[lastIndex] === '\n') {
        if (markdown.length === 1) {
          return ''
        } else if (markdown[lastIndex - 1] !== '\n') {
          return markdown
        }
      }

      markdown = trimTrailingNewlines(markdown)
      if (markdown.length === 0) {
        return ''
      }
      return markdown + '\n'
    }
    default:
      return markdown
  }
}

const trimTrailingNewlines = text => text.replace(/[\r?\n]+$/, '')

const createApplicationMenuState = ({ start, end, affiliation }) => {
  const state = {
    isDisabled: false,
    isMultiline: start.key !== end.key,
    isLooseListItem: false,
    isTaskList: false,
    isCodeFences: false,
    isCodeContent: false,
    isTable: false,
    affiliation: {}
  }
  const { isMultiline } = state

  if (
    (start.block.functionType === 'cellContent' && end.block.functionType === 'cellContent') ||
    (start.type === 'span' && start.block.functionType === 'codeContent') ||
    (end.type === 'span' && end.block.functionType === 'codeContent')
  ) {
    state.isCodeFences = true

    if (start.block.functionType === 'codeContent' || end.block.functionType === 'codeContent') {
      state.isCodeContent = true
    }
  }

  if (affiliation.length >= 1 && /ul|ol/.test(affiliation[0].type)) {
    const listBlock = affiliation[0]
    state.affiliation[listBlock.type] = true
    state.isLooseListItem = listBlock.children[0].isLooseListItem
    state.isTaskList = listBlock.listType === 'task'
  } else if (affiliation.length >= 3 && affiliation[1].type === 'li') {
    const listItem = affiliation[1]
    const listType = listItem.listItemType === 'order' ? 'ol' : 'ul'
    state.affiliation[listType] = true
    state.isLooseListItem = listItem.isLooseListItem
    state.isTaskList = listItem.listItemType === 'task'
  }

  for (const block of affiliation.slice(0, 3)) {
    if (block.type === 'pre' && block.functionType) {
      if (/frontmatter|html|multiplemath|code$/.test(block.functionType)) {
        state.isCodeFences = true
        state.affiliation[block.functionType] = true
      }
      break
    } else if (block.type === 'figure' && block.functionType) {
      if (block.functionType === 'table') {
        state.isTable = true
        state.isDisabled = true
      }
      break
    } else if (isMultiline && /^h{1,6}$/.test(block.type)) {
      state.affiliation = {}
      break
    } else if (!state.affiliation[block.type]) {
      state.affiliation[block.type] = true
    }
  }

  if (Object.getOwnPropertyNames(state.affiliation).length >= 2 && state.affiliation.p) {
    delete state.affiliation.p
  }
  if ((state.affiliation.ul || state.affiliation.ol) && state.affiliation.li) {
    delete state.affiliation.li
  }
  return state
}

const createSelectionFormatState = formats => {
  const state = {}
  for (const item of formats) {
    state[item.type] = true
  }
  return state
}

const scheduleSelectionMenuReport = payload => {
  pendingSelectionMenuState = payload
  if (selectionMenuReportTimer) {
    return
  }

  selectionMenuReportTimer = setTimeout(() => {
    selectionMenuReportTimer = null
    const nextPayload = pendingSelectionMenuState
    pendingSelectionMenuState = null

    if (!nextPayload || equal(nextPayload, lastSelectionMenuState)) {
      return
    }

    lastSelectionMenuState = nextPayload
    const { windowId } = getRuntime().env
    appApi.reportSelectionChange(windowId, nextPayload)
  }, MENU_UPDATE_THROTTLE_MS)
}

const scheduleSelectionFormatReport = payload => {
  pendingSelectionFormatState = payload
  if (selectionFormatReportTimer) {
    return
  }

  selectionFormatReportTimer = setTimeout(() => {
    selectionFormatReportTimer = null
    const nextPayload = pendingSelectionFormatState
    pendingSelectionFormatState = null

    if (!nextPayload || equal(nextPayload, lastSelectionFormatState)) {
      return
    }

    lastSelectionFormatState = nextPayload
    const { windowId } = getRuntime().env
    appApi.updateFormatMenu(windowId, nextPayload)
  }, MENU_UPDATE_THROTTLE_MS)
}

export const useEditorStore = defineStore('editor', {
  state: createEditorState,
  actions: {
    SET_SEARCH (value) {
      this.currentFile.searchMatches = value
    },
    SET_TOC (toc) {
      this.listToc = toc
      this.toc = listToTree(toc)
    },
    SET_CURRENT_FILE (currentFile) {
      const oldCurrentFile = this.currentFile
      if (!oldCurrentFile.id || oldCurrentFile.id !== currentFile.id) {
        const { id, markdown, cursor, history, pathname } = currentFile
        window.DIRNAME = pathname ? path.dirname(pathname) : ''
        this.currentFile = currentFile
        bus.$emit('file-changed', { id, markdown, cursor, renderCursor: true, history })
      }
    },
    ADD_FILE_TO_TABS (currentFile) {
      this.tabs.push(currentFile)
    },
    REMOVE_FILE_WITHIN_TABS (file) {
      const index = this.tabs.indexOf(file)
      this.tabs.splice(index, 1)

      if (file.id && autoSaveTimers.has(file.id)) {
        const timer = autoSaveTimers.get(file.id)
        clearTimeout(timer)
        autoSaveTimers.delete(file.id)
      }

      if (file.id === this.currentFile.id) {
        const fileState = this.tabs[index] || this.tabs[index - 1] || this.tabs[0] || {}
        this.currentFile = fileState
        if (typeof fileState.markdown === 'string') {
          const { id, markdown, cursor, history, pathname } = fileState
          window.DIRNAME = pathname ? path.dirname(pathname) : ''
          bus.$emit('file-changed', { id, markdown, cursor, renderCursor: true, history })
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }
    },
    EXCHANGE_TABS_BY_ID (tabIDs) {
      const { fromId } = tabIDs
      const toId = tabIDs.toId

      const moveItem = (arr, from, to) => {
        if (from === to) return true
        const len = arr.length
        const item = arr.splice(from, 1)
        if (item.length === 0) return false

        arr.splice(to, 0, item[0])
        return arr.length === len
      }

      const fromIndex = this.tabs.findIndex(tab => tab.id === fromId)
      if (!toId) {
        moveItem(this.tabs, fromIndex, this.tabs.length - 1)
      } else {
        const toIndex = this.tabs.findIndex(tab => tab.id === toId)
        const realToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
        moveItem(this.tabs, fromIndex, realToIndex)
      }
    },
    LOAD_CHANGE (change) {
      const { data, pathname } = change
      const {
        isMixedLineEndings,
        lineEnding,
        adjustLineEndingOnSave,
        trimTrailingNewline,
        encoding,
        markdown,
        filename
      } = data
      const options = { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
      const newFileState = getSingleFileState({ markdown, filename, pathname, options })

      const tab = this.tabs.find(entry => isSamePathSync(entry.pathname, pathname))
      if (!tab) {
        console.error('LOAD_CHANGE: Cannot find tab in tab list.')
        notice.notify({
          title: 'Error loading tab',
          message: 'There was an error while loading the file change because the tab cannot be found.',
          type: 'error',
          time: 20000,
          showConfirm: false
        })
        return
      }

      const oldId = tab.id
      const oldNotifications = tab.notifications
      let oldHistory = null
      if (tab.history.index >= 0 && tab.history.stack.length >= 1) {
        oldHistory = {
          stack: [tab.history.stack[tab.history.index]],
          index: 0
        }

        tab.history.index--
        tab.history.stack.pop()
      }

      Object.assign(tab, newFileState)
      tab.id = oldId
      tab.notifications = oldNotifications
      if (oldHistory) {
        tab.history = oldHistory
      }

      if (isMixedLineEndings) {
        tab.notifications.push({
          msg: `"${filename}" has mixed line endings which are automatically normalized to ${lineEnding.toUpperCase()}.`,
          showConfirm: false,
          style: 'info',
          exclusiveType: '',
          action: () => {}
        })
      }

      if (pathname === this.currentFile.pathname) {
        this.currentFile = tab
        const { id, cursor, history } = tab
        bus.$emit('file-changed', { id, markdown, cursor, renderCursor: true, history })
      }
    },
    SET_PATHNAME ({ tab, fileInfo }) {
      const { filename, pathname, id } = fileInfo

      if (id === this.currentFile.id && pathname) {
        window.DIRNAME = path.dirname(pathname)
      }

      if (tab) {
        Object.assign(tab, { filename, pathname, isSaved: true })
      }
    },
    SET_SAVE_STATUS_BY_TAB ({ tab, status }) {
      if (hasKeys(tab)) {
        tab.isSaved = status
      }
    },
    SET_SAVE_STATUS (status) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.isSaved = status
      }
    },
    SET_SAVE_STATUS_WHEN_REMOVE ({ pathname }) {
      this.tabs.forEach(file => {
        if (file.pathname === pathname) {
          file.isSaved = false
        }
      })
    },
    SET_MARKDOWN (markdown) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.markdown = markdown
      }
    },
    SET_DOCUMENT_ENCODING (encoding) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.encoding = encoding
      }
    },
    SET_LINE_ENDING (lineEnding) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.lineEnding = lineEnding
      }
    },
    SET_FILE_ENCODING_BY_NAME (encodingName) {
      if (hasKeys(this.currentFile)) {
        const { encoding } = this.currentFile
        encoding.encoding = encodingName
        encoding.isBom = false
      }
    },
    SET_FINAL_NEWLINE (value) {
      if (hasKeys(this.currentFile) && value >= 0 && value <= 3) {
        this.currentFile.trimTrailingNewline = value
      }
    },
    SET_ADJUST_LINE_ENDING_ON_SAVE (adjustLineEndingOnSave) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.adjustLineEndingOnSave = adjustLineEndingOnSave
      }
    },
    SET_WORD_COUNT (wordCount) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.wordCount = wordCount
      }
    },
    SET_CURSOR (cursor) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.cursor = cursor
      }
    },
    SET_HISTORY (history) {
      if (hasKeys(this.currentFile)) {
        this.currentFile.history = history
      }
    },
    CLOSE_TABS (tabIdList) {
      if (!tabIdList || tabIdList.length === 0) return

      let tabIndex = 0
      tabIdList.forEach(id => {
        const index = this.tabs.findIndex(file => file.id === id)
        const { pathname } = this.tabs[index]

        if (pathname) {
          appApi.notifyWindowTabClosed(pathname)
        }

        this.tabs.splice(index, 1)
        if (this.currentFile.id === id) {
          this.currentFile = {}
          window.DIRNAME = ''
          if (tabIdList.length === 1) {
            tabIndex = index
          }
        }
      })

      if (!this.currentFile.id && this.tabs.length) {
        this.currentFile = this.tabs[tabIndex] || this.tabs[tabIndex - 1] || this.tabs[0] || {}
        if (typeof this.currentFile.markdown === 'string') {
          const { id, markdown, cursor, history, pathname } = this.currentFile
          window.DIRNAME = pathname ? path.dirname(pathname) : ''
          bus.$emit('file-changed', { id, markdown, cursor, renderCursor: true, history })
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }
    },
    RENAME_IF_NEEDED ({ src, dest }) {
      this.tabs.forEach(file => {
        if (file.pathname === src) {
          file.pathname = dest
          file.filename = path.basename(dest)
        }
      })
    },
    PUSH_TAB_NOTIFICATION (data) {
      const defaultAction = () => {}
      const { tabId, msg } = data
      const action = data.action || defaultAction
      const showConfirm = data.showConfirm || false
      const style = data.style || 'info'
      const exclusiveType = data.exclusiveType || ''

      const tab = this.tabs.find(entry => entry.id === tabId)
      if (!tab) {
        console.error('PUSH_TAB_NOTIFICATION: Cannot find tab in tab list.')
        return
      }

      const { notifications } = tab

      if (exclusiveType) {
        const index = notifications.findIndex(notification => notification.exclusiveType === exclusiveType)
        if (index >= 0) {
          notifications.splice(index, 1)
        }
      }

      notifications.push({
        msg,
        showConfirm,
        style,
        exclusiveType,
        action
      })
    },
    FORMAT_LINK_CLICK ({ data, dirname }) {
      appApi.notifyFormatLinkClick({ data, dirname })
    },
    LISTEN_SCREEN_SHOT () {
      events.on('mt::screenshot-captured', () => {
        bus.$emit('screenshot-captured')
      })
    },
    ASK_FOR_IMAGE_AUTO_PATH (src) {
      const { pathname } = this.currentFile
      if (!pathname) {
        return []
      }

      let resolveResult
      const promise = new Promise(resolve => {
        resolveResult = resolve
      })
      const id = getUniqueId()
      events.once(`mt::response-of-image-path-${id}`, (event, files) => {
        resolveResult(files)
      })
      appApi.requestImageAutoPath({ pathname, src, id })
      return promise
    },
    SEARCH (value) {
      this.SET_SEARCH(value)
    },
    SHOW_IMAGE_DELETION_URL (deletionUrl) {
      notice.notify({
        title: 'Image deletion URL',
        message: `Click to copy the deletion URL of the uploaded image to the clipboard (${deletionUrl}).`,
        showConfirm: true,
        time: 20000
      })
        .then(() => {
          clipboard.writeText(deletionUrl)
        })
    },
    FORCE_CLOSE_TAB (file) {
      this.REMOVE_FILE_WITHIN_TABS(file)
      const { pathname } = file
      if (pathname) {
        appApi.notifyWindowTabClosed(pathname)
      }
    },
    UPDATE_LINE_ENDING_MENU () {
      const { lineEnding } = this.currentFile
      if (lineEnding) {
        const { windowId } = getRuntime().env
        appApi.updateLineEndingMenu(windowId, lineEnding)
      }
    },
    CLOSE_UNSAVED_TAB (file) {
      const { id, pathname, filename, markdown } = file
      const options = getOptionsFromState(file)
      appApi.saveAndCloseTabs([{ id, pathname, filename, markdown, options }])
    },
    LISTEN_FOR_SAVE () {
      events.on('mt::editor-ask-file-save', () => {
        const { id, filename, pathname, markdown } = this.currentFile
        const options = getOptionsFromState(this.currentFile)
        const defaultPath = getRootFolderFromProjectStore(useProjectStore(this.$pinia))
        if (id) {
          appApi.respondFileSave({
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath
          })
        }
      })
    },
    LISTEN_FOR_SAVE_AS () {
      events.on('mt::editor-ask-file-save-as', () => {
        const { id, filename, pathname, markdown } = this.currentFile
        const options = getOptionsFromState(this.currentFile)
        const defaultPath = getRootFolderFromProjectStore(useProjectStore(this.$pinia))
        if (id) {
          appApi.respondFileSaveAs({
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath
          })
        }
      })
    },
    LISTEN_FOR_SET_PATHNAME () {
      events.on('mt::set-pathname', (event, fileInfo) => {
        const { pathname, id } = fileInfo
        const tab = this.tabs.find(file => file.id === id)
        if (!tab) {
          console.error('[ERROR] Cannot change file path from unknown tab.')
          return
        }

        const existingTab = this.tabs.find(entry => entry.id !== id && isSamePathSync(entry.pathname, pathname))
        if (existingTab) {
          this.CLOSE_TAB(existingTab)
        }
        this.SET_PATHNAME({ tab, fileInfo })
      })

      events.on('mt::tab-saved', (event, tabId) => {
        const tab = this.tabs.find(file => file.id === tabId)
        if (tab) {
          Object.assign(tab, { isSaved: true })
        }
      })

      events.on('mt::tab-save-failure', (event, tabId, msg) => {
        const tab = this.tabs.find(file => file.id === tabId)
        if (!tab) {
          notice.notify({
            title: 'Save failure',
            message: msg,
            type: 'error',
            time: 20000,
            showConfirm: false
          })
          return
        }

        this.SET_SAVE_STATUS_BY_TAB({ tab, status: false })
        this.PUSH_TAB_NOTIFICATION({
          tabId,
          msg: `There was an error while saving: ${msg}`,
          style: 'crit'
        })
      })
    },
    LISTEN_FOR_CLOSE () {
      events.on('mt::ask-for-close', () => {
        const unsavedFiles = this.tabs
          .filter(file => !file.isSaved)
          .map(file => {
            const { id, filename, pathname, markdown } = file
            const options = getOptionsFromState(file)
            return { id, filename, pathname, markdown, options }
          })

        if (unsavedFiles.length) {
          appApi.closeWindowConfirm(unsavedFiles)
        } else {
          appApi.forceCloseWindow()
        }
      })
    },
    LISTEN_FOR_SAVE_CLOSE () {
      events.on('mt::force-close-tabs-by-id', (event, tabIdList) => {
        if (Array.isArray(tabIdList) && tabIdList.length) {
          this.CLOSE_TABS(tabIdList)
        }
      })
    },
    ASK_FOR_SAVE_ALL (closeTabs) {
      const unsavedFiles = this.tabs
        .filter(file => !(file.isSaved && /[^\n]/.test(file.markdown)))
        .map(file => {
          const { id, filename, pathname, markdown } = file
          const options = getOptionsFromState(file)
          return { id, filename, pathname, markdown, options }
        })

      if (closeTabs) {
        if (unsavedFiles.length) {
          this.CLOSE_TABS(this.tabs.filter(file => file.isSaved).map(file => file.id))
          appApi.saveAndCloseTabs(unsavedFiles)
        } else {
          this.CLOSE_TABS(this.tabs.map(file => file.id))
        }
      } else {
        appApi.saveTabs(unsavedFiles)
      }
    },
    LISTEN_FOR_MOVE_TO () {
      events.on('mt::editor-move-file', () => {
        const { id, filename, pathname, markdown } = this.currentFile
        const options = getOptionsFromState(this.currentFile)
        const defaultPath = getRootFolderFromProjectStore(useProjectStore(this.$pinia))
        if (!id) return
        if (!pathname) {
          appApi.respondFileSave({
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath
          })
        } else {
          appApi.respondFileMoveTo({ id, pathname })
        }
      })
    },
    LISTEN_FOR_RENAME () {
      events.on('mt::editor-rename-file', () => {
        this.RESPONSE_FOR_RENAME()
      })
    },
    RESPONSE_FOR_RENAME () {
      const { id, filename, pathname, markdown } = this.currentFile
      const options = getOptionsFromState(this.currentFile)
      const defaultPath = getRootFolderFromProjectStore(useProjectStore(this.$pinia))
      if (!id) return
      if (!pathname) {
        appApi.respondFileSave({
          id,
          filename,
          pathname,
          markdown,
          options,
          defaultPath
        })
      } else {
        bus.$emit('rename')
      }
    },
    RENAME (newFilename) {
      const { id, pathname, filename } = this.currentFile
      if (typeof filename === 'string' && filename !== newFilename) {
        const newPathname = path.join(path.dirname(pathname), newFilename)
        appApi.renameFile({ id, pathname, newPathname })
      }
    },
    UPDATE_CURRENT_FILE (currentFile) {
      this.SET_CURRENT_FILE(currentFile)
      if (!this.tabs.some(file => file.id === currentFile.id)) {
        this.ADD_FILE_TO_TABS(currentFile)
      }
      this.UPDATE_LINE_ENDING_MENU()
    },
    LISTEN_FOR_BOOTSTRAP_WINDOW () {
      setTimeout(() => {
        const projectStore = useProjectStore(this.$pinia)
        bus.$emit('cmd::register-command', new FileEncodingCommand(this))
        bus.$emit('cmd::register-command', new QuickOpenCommand({ editor: this, project: projectStore }))
        bus.$emit('cmd::register-command', new LineEndingCommand(this))
        bus.$emit('cmd::register-command', new TrailingNewlineCommand(this))

        setTimeout(() => {
          appApi.requestKeybindings()
          bus.$emit('cmd::sort-commands')
        }, 100)
      }, 400)

      events.on('mt::bootstrap-editor', (event, config) => {
        const {
          addBlankTab,
          markdownList,
          lineEnding,
          sideBarVisibility,
          tabBarVisibility,
          sourceCodeModeEnabled
        } = config
        const appStore = useAppStore(this.$pinia)
        const layoutStore = useLayoutStore(this.$pinia)
        const preferencesStore = usePreferencesStore(this.$pinia)

        appStore.markInitialized()
        preferencesStore.applyPreferences({ endOfLine: lineEnding })
        layoutStore.applyLayout({
          rightColumn: 'files',
          showSideBar: !!sideBarVisibility,
          showTabBar: !!tabBarVisibility
        })
        layoutStore.dispatchLayoutMenuItems()

        preferencesStore.setMode({
          type: 'sourceCode',
          checked: !!sourceCodeModeEnabled
        })

        if (addBlankTab) {
          this.NEW_UNTITLED_TAB({})
        } else if (markdownList.length) {
          let isFirst = true
          for (const markdown of markdownList) {
            isFirst = false
            this.NEW_UNTITLED_TAB({ markdown, selected: isFirst })
          }
        }
      })
    },
    LISTEN_FOR_NEW_TAB () {
      events.on('mt::open-new-tab', (event, markdownDocument, options = {}, selected = true) => {
        if (markdownDocument) {
          this.NEW_TAB_WITH_CONTENT({ markdownDocument, options, selected })
        } else {
          this.NEW_UNTITLED_TAB({})
        }
      })

      events.on('mt::new-untitled-tab', (event, selected = true, markdown = '') => {
        this.NEW_UNTITLED_TAB({ markdown, selected })
      })
    },
    LISTEN_FOR_CLOSE_TAB () {
      events.on('mt::editor-close-tab', () => {
        const file = this.currentFile
        if (!hasKeys(file)) return
        this.CLOSE_TAB(file)
      })
    },
    LISTEN_FOR_TAB_CYCLE () {
      events.on('mt::tabs-cycle-left', () => {
        this.CYCLE_TABS(false)
      })
      events.on('mt::tabs-cycle-right', () => {
        this.CYCLE_TABS(true)
      })
    },
    LISTEN_FOR_SWITCH_TABS () {
      events.on('mt::switch-tab-by-index', (event, index) => {
        this.SWITCH_TAB_BY_INDEX(index)
      })
    },
    CLOSE_TAB (file) {
      if (file.isSaved) {
        this.FORCE_CLOSE_TAB(file)
      } else {
        this.CLOSE_UNSAVED_TAB(file)
      }
    },
    CLOSE_OTHER_TABS (file) {
      this.tabs.filter(tab => tab.id !== file.id).forEach(tab => {
        this.CLOSE_TAB(tab)
      })
    },
    CLOSE_SAVED_TABS () {
      this.tabs.filter(tab => tab.isSaved).forEach(tab => {
        this.CLOSE_TAB(tab)
      })
    },
    CLOSE_ALL_TABS () {
      this.tabs.slice().forEach(tab => {
        this.CLOSE_TAB(tab)
      })
    },
    RENAME_FILE (file) {
      this.SET_CURRENT_FILE(file)
      this.UPDATE_LINE_ENDING_MENU()
      bus.$emit('rename')
    },
    CYCLE_TABS (direction) {
      if (this.tabs.length <= 1) {
        return
      }

      const currentIndex = this.tabs.findIndex(tab => tab.id === this.currentFile.id)
      if (currentIndex === -1) {
        console.error('CYCLE_TABS: Cannot find current tab index.')
        return
      }

      let nextTabIndex = 0
      if (!direction) {
        nextTabIndex = currentIndex === 0 ? this.tabs.length - 1 : currentIndex - 1
      } else {
        nextTabIndex = (currentIndex + 1) % this.tabs.length
      }

      const nextTab = this.tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`CYCLE_TABS: Cannot find next tab (index="${nextTabIndex}").`)
        return
      }

      this.SET_CURRENT_FILE(nextTab)
      this.UPDATE_LINE_ENDING_MENU()
    },
    SWITCH_TAB_BY_INDEX (nextTabIndex) {
      if (nextTabIndex < 0 || nextTabIndex >= this.tabs.length) {
        console.warn('Invalid tab index:', nextTabIndex)
        return
      }

      const currentIndex = this.tabs.findIndex(tab => tab.id === this.currentFile.id)
      if (currentIndex === -1) {
        console.error('Cannot find current tab index.')
        return
      }

      const nextTab = this.tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`Cannot find tab by index="${nextTabIndex}".`)
        return
      }

      this.SET_CURRENT_FILE(nextTab)
      this.UPDATE_LINE_ENDING_MENU()
    },
    NEW_UNTITLED_TAB ({ markdown: markdownString, selected }) {
      if (selected == null) {
        selected = true
      }

      this.SHOW_TAB_VIEW(false)

      const preferencesStore = usePreferencesStore(this.$pinia)
      const fileState = getBlankFileState(this.tabs, preferencesStore.defaultEncoding, preferencesStore.endOfLine, markdownString)

      if (selected) {
        const { id, markdown } = fileState
        this.UPDATE_CURRENT_FILE(fileState)
        bus.$emit('file-loaded', { id, markdown })
      } else {
        this.ADD_FILE_TO_TABS(fileState)
      }
    },
    NEW_TAB_WITH_CONTENT ({ markdownDocument, options = {}, selected }) {
      if (!markdownDocument) {
        console.warn('Cannot create a file tab without a markdown document!')
        this.NEW_UNTITLED_TAB({})
        return
      }

      if (typeof selected === 'undefined') {
        selected = true
      }

      const { pathname } = markdownDocument
      const existingTab = this.tabs.find(tab => isSamePathSync(tab.pathname, pathname))
      if (existingTab) {
        this.UPDATE_CURRENT_FILE(existingTab)
        return
      }

      let keepTabBarState = false
      if (this.currentFile) {
        const { isSaved, pathname } = this.currentFile
        if (isSaved && !pathname) {
          keepTabBarState = true
          this.FORCE_CLOSE_TAB(this.currentFile)
        }
      }

      if (!keepTabBarState) {
        this.SHOW_TAB_VIEW(false)
      }

      const { markdown, isMixedLineEndings } = markdownDocument
      const docState = createDocumentState(Object.assign(markdownDocument, options))
      const { id, cursor } = docState

      if (selected) {
        this.UPDATE_CURRENT_FILE(docState)
        bus.$emit('file-loaded', { id, markdown, cursor })
      } else {
        this.ADD_FILE_TO_TABS(docState)
      }

      if (isMixedLineEndings) {
        const { filename, lineEnding } = markdownDocument
        this.PUSH_TAB_NOTIFICATION({
          tabId: id,
          msg: `${filename}" has mixed line endings which are automatically normalized to ${lineEnding.toUpperCase()}.`
        })
      }
    },
    SHOW_TAB_VIEW (always) {
      if (always || this.tabs.length === 1) {
        const layoutStore = useLayoutStore(this.$pinia)
        layoutStore.applyLayout({ showTabBar: true })
        layoutStore.dispatchLayoutMenuItems()
      }
    },
    LISTEN_FOR_CONTENT_CHANGE ({ id, markdown, wordCount, cursor, history, toc }) {
      const preferencesStore = usePreferencesStore(this.$pinia)
      const {
        id: currentId,
        filename,
        pathname,
        markdown: oldMarkdown,
        trimTrailingNewline
      } = this.currentFile

      if (!id) {
        throw new Error('Listen for document change but id was not set!')
      } else if (!currentId || this.tabs.length === 0) {
        return
      } else if (id !== 'muya' && currentId !== id) {
        for (const tab of this.tabs) {
          if (tab.id && tab.id === id) {
            tab.markdown = adjustTrailingNewlines(markdown, tab.trimTrailingNewline)
            if (cursor) {
              tab.cursor = cursor
            }
            if (history) {
              tab.history = history
            }
            break
          }
        }
        return
      }

      markdown = adjustTrailingNewlines(markdown, trimTrailingNewline)
      this.SET_MARKDOWN(markdown)

      if (oldMarkdown.length === 0 && markdown.length === 1 && markdown[0] === '\n') {
        return
      }

      if (wordCount) {
        this.SET_WORD_COUNT(wordCount)
      }
      if (cursor) {
        this.SET_CURSOR(cursor)
      }
      if (history) {
        this.SET_HISTORY(history)
      }
      if (toc && !equal(toc, this.listToc)) {
        this.SET_TOC(toc)
      }

      if (markdown !== oldMarkdown) {
        this.SET_SAVE_STATUS(false)

        if (pathname && preferencesStore.autoSave) {
          const options = getOptionsFromState(this.currentFile)
          this.HANDLE_AUTO_SAVE({
            id: currentId,
            filename,
            pathname,
            markdown,
            options
          })
        }
      }
    },
    HANDLE_AUTO_SAVE ({ id, filename, pathname, markdown, options }) {
      if (!id || !pathname) {
        throw new Error('HANDLE_AUTO_SAVE: Invalid tab.')
      }

      const preferencesStore = usePreferencesStore(this.$pinia)

      if (autoSaveTimers.has(id)) {
        const timer = autoSaveTimers.get(id)
        clearTimeout(timer)
        autoSaveTimers.delete(id)
      }

      const timer = setTimeout(() => {
        autoSaveTimers.delete(id)
        const tab = this.tabs.find(entry => entry.id === id)
        if (tab && !tab.isSaved) {
          const defaultPath = getRootFolderFromProjectStore(useProjectStore(this.$pinia))
          appApi.respondFileSave({
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath
          })
        }
      }, preferencesStore.autoSaveDelay)

      autoSaveTimers.set(id, timer)
    },
    SELECTION_CHANGE (changes) {
      const { start, end } = changes
      if (start.key === end.key && start.block.text) {
        this.SET_SEARCH({
          matches: [],
          index: -1,
          value: start.block.text.substring(start.offset, end.offset)
        })
      }

      scheduleSelectionMenuReport(createApplicationMenuState(changes))
    },
    SELECTION_FORMATS (formats) {
      scheduleSelectionFormatReport(createSelectionFormatState(formats))
    },
    EXPORT ({ type, content, pageOptions }) {
      if (!hasKeys(this.currentFile)) return

      let title = ''
      if (this.listToc && this.listToc.length > 0) {
        let headerRef = this.listToc[0]
        const len = Math.min(this.listToc.length, 6)
        for (let i = 1; i < len; ++i) {
          if (headerRef.lvl === 1) {
            break
          }

          const header = this.listToc[i]
          if (headerRef.lvl > header.lvl) {
            headerRef = header
          }
        }
        title = headerRef.content
      }

      const { filename, pathname } = this.currentFile
      appApi.respondExport({
        type,
        title,
        content,
        filename,
        pathname,
        pageOptions
      })
    },
    LINTEN_FOR_EXPORT_SUCCESS () {
      events.on('mt::export-success', (event, { type, filePath }) => {
        notice.notify({
          title: 'Exported successfully',
          message: `Exported "${path.basename(filePath)}" successfully!`,
          showConfirm: true
        })
          .then(() => {
            shell.showItemInFolder(filePath)
          })
      })
    },
    PRINT_RESPONSE () {
      appApi.respondPrint()
    },
    LINTEN_FOR_PRINT_SERVICE_CLEARUP () {
      events.on('mt::print-service-clearup', () => {
        bus.$emit('print-service-clearup')
      })
    },
    LINTEN_FOR_SET_LINE_ENDING () {
      events.on('mt::set-line-ending', (event, lineEnding) => {
        const { lineEnding: oldLineEnding } = this.currentFile
        if (lineEnding !== oldLineEnding) {
          this.SET_LINE_ENDING(lineEnding)
          this.SET_ADJUST_LINE_ENDING_ON_SAVE(lineEnding !== 'lf')
          this.SET_SAVE_STATUS(true)

          if (!event) {
            this.UPDATE_LINE_ENDING_MENU()
          }
        }
      })
    },
    LINTEN_FOR_SET_ENCODING () {
      events.on('mt::set-file-encoding', (event, encodingName) => {
        const { encoding } = this.currentFile.encoding
        if (encoding !== encodingName) {
          this.SET_FILE_ENCODING_BY_NAME(encodingName)
          this.SET_SAVE_STATUS(true)
        }
      })
    },
    LINTEN_FOR_SET_FINAL_NEWLINE () {
      events.on('mt::set-final-newline', (event, value) => {
        const { trimTrailingNewline } = this.currentFile
        if (trimTrailingNewline !== value) {
          this.SET_FINAL_NEWLINE(value)
          this.SET_SAVE_STATUS(true)
        }
      })
    },
    LISTEN_FOR_FILE_CHANGE () {
      events.on('mt::update-file', (event, { type, change }) => {
        const { pathname } = change
        const tab = this.tabs.find(entry => isSamePathSync(entry.pathname, pathname))
        if (!tab) {
          console.error(`LISTEN_FOR_FILE_CHANGE: Cannot find tab for path "${pathname}".`)
          return
        }

        const preferencesStore = usePreferencesStore(this.$pinia)
        const { id, isSaved, filename } = tab
        switch (type) {
          case 'unlink':
            this.SET_SAVE_STATUS_BY_TAB({ tab, status: false })
            this.PUSH_TAB_NOTIFICATION({
              tabId: id,
              msg: `"${filename}" has been removed on disk.`,
              style: 'warn',
              showConfirm: false,
              exclusiveType: 'file_changed'
            })
            break
          case 'add':
          case 'change':
            if (preferencesStore.autoSave) {
              if (autoSaveTimers.has(id)) {
                const timer = autoSaveTimers.get(id)
                clearTimeout(timer)
                autoSaveTimers.delete(id)
              }

              if (isSaved) {
                this.LOAD_CHANGE(change)
                return
              }
            }

            this.SET_SAVE_STATUS_BY_TAB({ tab, status: false })
            this.PUSH_TAB_NOTIFICATION({
              tabId: id,
              msg: `"${filename}" has been changed on disk. Do you want to reload it?`,
              showConfirm: true,
              exclusiveType: 'file_changed',
              action: status => {
                if (status) {
                  this.LOAD_CHANGE(change)
                }
              }
            })
            break
          default:
            console.error(`LISTEN_FOR_FILE_CHANGE: Invalid type "${type}"`)
        }
      })
    },
    ASK_FOR_IMAGE_PATH () {
      return appApi.askForImagePath()
    },
    LISTEN_WINDOW_ZOOM () {
      events.on('mt::window-zoom', (event, zoomFactor) => {
        zoomFactor = Number.parseFloat(zoomFactor.toFixed(3))
        const preferencesStore = usePreferencesStore(this.$pinia)
        if (preferencesStore.zoom !== zoomFactor) {
          preferencesStore.setSinglePreference({ type: 'zoom', value: zoomFactor })
        }
        nativeWindow.setZoomFactor(zoomFactor)
      })
    },
    LISTEN_FOR_RELOAD_IMAGES () {
      events.on('mt::invalidate-image-cache', () => {
        bus.$emit('invalidate-image-cache')
      })
    },
    LISTEN_FOR_CONTEXT_MENU () {
      events.on('mt::cm-copy-as-markdown', () => {
        bus.$emit('copyAsMarkdown', 'copyAsMarkdown')
      })
      events.on('mt::cm-copy-as-html', () => {
        bus.$emit('copyAsHtml', 'copyAsHtml')
      })
      events.on('mt::cm-paste-as-plain-text', () => {
        bus.$emit('pasteAsPlainText', 'pasteAsPlainText')
      })
      events.on('mt::cm-insert-paragraph', (event, location) => {
        bus.$emit('insertParagraph', location)
      })
      events.on('mt::spelling-replace-misspelling', (event, info) => {
        bus.$emit('replace-misspelling', info)
      })
      events.on('mt::spelling-show-switch-language', () => {
        bus.$emit('open-command-spellchecker-switch-language')
      })
    },
    bindScreenShot () {
      return this.LISTEN_SCREEN_SHOT()
    },
    bindClose () {
      return this.LISTEN_FOR_CLOSE()
    },
    bindSaveAs () {
      return this.LISTEN_FOR_SAVE_AS()
    },
    bindMoveTo () {
      return this.LISTEN_FOR_MOVE_TO()
    },
    bindSave () {
      return this.LISTEN_FOR_SAVE()
    },
    bindSetPathname () {
      return this.LISTEN_FOR_SET_PATHNAME()
    },
    bindBootstrapWindow () {
      return this.LISTEN_FOR_BOOTSTRAP_WINDOW()
    },
    bindSaveClose () {
      return this.LISTEN_FOR_SAVE_CLOSE()
    },
    bindRename () {
      return this.LISTEN_FOR_RENAME()
    },
    bindSetLineEnding () {
      return this.LINTEN_FOR_SET_LINE_ENDING()
    },
    bindSetEncoding () {
      return this.LINTEN_FOR_SET_ENCODING()
    },
    bindSetFinalNewline () {
      return this.LINTEN_FOR_SET_FINAL_NEWLINE()
    },
    bindNewTabEvents () {
      return this.LISTEN_FOR_NEW_TAB()
    },
    bindCloseTabEvents () {
      return this.LISTEN_FOR_CLOSE_TAB()
    },
    bindTabCycleEvents () {
      return this.LISTEN_FOR_TAB_CYCLE()
    },
    bindSwitchTabsEvents () {
      return this.LISTEN_FOR_SWITCH_TABS()
    },
    bindPrintServiceCleanup () {
      return this.LINTEN_FOR_PRINT_SERVICE_CLEARUP()
    },
    bindExportSuccess () {
      return this.LINTEN_FOR_EXPORT_SUCCESS()
    },
    bindFileChange () {
      return this.LISTEN_FOR_FILE_CHANGE()
    },
    bindWindowZoom () {
      return this.LISTEN_WINDOW_ZOOM()
    },
    bindReloadImages () {
      return this.LISTEN_FOR_RELOAD_IMAGES()
    },
    bindContextMenu () {
      return this.LISTEN_FOR_CONTEXT_MENU()
    },
    updateCurrentFile (currentFile) {
      return this.UPDATE_CURRENT_FILE(currentFile)
    },
    forceCloseTab (file) {
      return this.FORCE_CLOSE_TAB(file)
    },
    closeUnsavedTab (file) {
      return this.CLOSE_UNSAVED_TAB(file)
    },
    setSaveStatusWhenRemove (change) {
      return this.SET_SAVE_STATUS_WHEN_REMOVE(change)
    },
    renameIfNeeded (payload) {
      return this.RENAME_IF_NEEDED(payload)
    },
    dispatch (type, payload) {
      switch (type) {
        case 'NEW_UNTITLED_TAB':
          return this.NEW_UNTITLED_TAB(payload || {})
        case 'CLOSE_TAB':
          return this.CLOSE_TAB(payload)
        case 'CLOSE_OTHER_TABS':
          return this.CLOSE_OTHER_TABS(payload)
        case 'CLOSE_SAVED_TABS':
          return this.CLOSE_SAVED_TABS()
        case 'CLOSE_ALL_TABS':
          return this.CLOSE_ALL_TABS()
        case 'RENAME_FILE':
          return this.RENAME_FILE(payload)
        case 'EXCHANGE_TABS_BY_ID':
          return this.EXCHANGE_TABS_BY_ID(payload)
        case 'LISTEN_FOR_CONTENT_CHANGE':
          return this.LISTEN_FOR_CONTENT_CHANGE(payload)
        case 'ASK_FOR_SAVE_ALL':
          return this.ASK_FOR_SAVE_ALL(payload)
        case 'FORMAT_LINK_CLICK':
          return this.FORMAT_LINK_CLICK(payload)
        case 'SELECTION_CHANGE':
          return this.SELECTION_CHANGE(payload)
        case 'SELECTION_FORMATS':
          return this.SELECTION_FORMATS(payload)
        case 'ASK_FOR_IMAGE_AUTO_PATH':
          return this.ASK_FOR_IMAGE_AUTO_PATH(payload)
        case 'ASK_FOR_IMAGE_PATH':
          return this.ASK_FOR_IMAGE_PATH()
        case 'SEARCH':
          return this.SEARCH(payload)
        case 'SHOW_IMAGE_DELETION_URL':
          return this.SHOW_IMAGE_DELETION_URL(payload)
        case 'EXPORT':
          return this.EXPORT(payload)
        case 'PRINT_RESPONSE':
          return this.PRINT_RESPONSE()
        case 'RENAME':
          return this.RENAME(payload)
        case 'RESPONSE_FOR_RENAME':
          return this.RESPONSE_FOR_RENAME()
        default:
          throw new Error(`Unknown editor action: ${type}`)
      }
    },
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
