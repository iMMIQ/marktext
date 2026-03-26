import { contextBridge, ipcRenderer, webFrame } from 'electron'

const bridge = {
  window: {
    minimize: () => ipcRenderer.send('mt::window-minimize'),
    maximizeOrRestore: () => ipcRenderer.send('mt::window-toggle-maximize'),
    toggleFullScreen: () => ipcRenderer.send('mt::window-toggle-full-screen'),
    close: () => ipcRenderer.send('mt::window-close'),
    setZoomFactor: value => webFrame.setZoomFactor(value),
    getState: () => ipcRenderer.invoke('mt::window-get-state')
  },
  menu: {
    popupApplicationMenu: position => ipcRenderer.send('mt::menu-popup-application', position)
  },
  clipboard: {
    readFilePath: () => ipcRenderer.invoke('mt::clipboard-read-file-path'),
    readFilePathSync: () => ipcRenderer.sendSync('mt::clipboard-read-file-path-sync'),
    writeText: text => ipcRenderer.send('mt::clipboard-write-text', text)
  },
  filesystem: {
    create: (pathname, type) => ipcRenderer.invoke('mt::fs-create', pathname, type),
    paste: payload => ipcRenderer.invoke('mt::fs-paste', payload),
    rename: (src, dest) => ipcRenderer.invoke('mt::fs-rename', src, dest),
    trashItem: pathname => ipcRenderer.invoke('mt::fs-trash-item', pathname),
    moveToRelativeFolder: payload => ipcRenderer.invoke('mt::fs-move-to-relative-folder', payload),
    moveImageToFolder: payload => ipcRenderer.invoke('mt::fs-move-image-to-folder', payload),
    uploadImage: payload => ipcRenderer.invoke('mt::fs-upload-image', payload),
    isFileExecutable: filepath => ipcRenderer.invoke('mt::fs-is-file-executable', filepath),
    commandExists: command => ipcRenderer.invoke('mt::fs-command-exists', command),
    readDirectory: pathname => ipcRenderer.invoke('mt::fs-read-directory', pathname),
    readFile: (pathname, encoding) => ipcRenderer.invoke('mt::fs-read-file', pathname, encoding)
  },
  fonts: {
    listFamilies: options => ipcRenderer.invoke('mt::fonts-list-families', options)
  },
  keyboard: {
    getInfo: () => ipcRenderer.invoke('mt::keyboard-get-info'),
    dumpInfo: () => ipcRenderer.send('mt::keyboard-dump-info')
  },
  shell: {
    openPath: target => ipcRenderer.invoke('mt::shell-open-path', target),
    showItemInFolder: target => ipcRenderer.invoke('mt::shell-show-item-in-folder', target),
    openExternal: target => ipcRenderer.invoke('mt::shell-open-external', target)
  },
  runtime: {
    getInfo: () => ipcRenderer.invoke('mt::runtime-get-info')
  },
  search: {
    cancel: requestId => ipcRenderer.invoke('mt::search-cancel', requestId),
    searchFiles: (rootPath, options) => ipcRenderer.invoke('mt::search-files', rootPath, options),
    searchText: (directories, pattern, options) => ipcRenderer.invoke('mt::search-text', directories, pattern, options)
  },
  app: {
    openSettingsWindow: () => ipcRenderer.send('mt::open-setting-window'),
    newEditorWindow: () => ipcRenderer.send('mt::cmd-new-editor-window'),
    openFile: () => ipcRenderer.send('mt::cmd-open-file'),
    openFolder: () => ipcRenderer.send('mt::cmd-open-folder'),
    openFilePath: (pathname, options = {}) => ipcRenderer.send('mt::open-file', pathname, options),
    openFileByWindowId: (windowId, pathname) => ipcRenderer.send('mt::open-file-by-window-id', windowId, pathname),
    dropFiles: fileList => ipcRenderer.send('mt::window::drop', fileList),
    closeWindow: () => ipcRenderer.send('mt::cmd-close-window'),
    forceCloseWindow: () => ipcRenderer.send('mt::close-window'),
    closeWindowConfirm: unsavedFiles => ipcRenderer.send('mt::close-window-confirm', unsavedFiles),
    toggleAutoSave: () => ipcRenderer.send('mt::cmd-toggle-autosave'),
    importFile: () => ipcRenderer.send('mt::cmd-import-file'),
    toggleAlwaysOnTop: () => ipcRenderer.send('mt::window-toggle-always-on-top'),
    tryQuit: () => ipcRenderer.send('mt::app-try-quit'),
    checkForUpdate: () => ipcRenderer.send('mt::check-for-update'),
    makeScreenshot: () => ipcRenderer.send('mt::make-screenshot'),
    handleRendererError: payload => ipcRenderer.send('mt::handle-renderer-error', payload),
    notifyNeedUpdate: payload => ipcRenderer.send('mt::NEED_UPDATE', payload),
    notifyWindowTabClosed: pathname => ipcRenderer.send('mt::window-tab-closed', pathname),
    notifyFormatLinkClick: payload => ipcRenderer.send('mt::format-link-click', payload),
    requestImageAutoPath: payload => ipcRenderer.send('mt::ask-for-image-auto-path', payload),
    askForImagePath: () => ipcRenderer.invoke('mt::ask-for-image-path'),
    updateLineEndingMenu: (windowId, lineEnding) => ipcRenderer.send('mt::update-line-ending-menu', windowId, lineEnding),
    saveTabs: payload => ipcRenderer.send('mt::save-tabs', payload),
    saveAndCloseTabs: payload => ipcRenderer.send('mt::save-and-close-tabs', payload),
    respondFileSave: payload => ipcRenderer.send('mt::response-file-save', payload),
    respondFileSaveAs: payload => ipcRenderer.send('mt::response-file-save-as', payload),
    respondFileMoveTo: payload => ipcRenderer.send('mt::response-file-move-to', payload),
    renameFile: payload => ipcRenderer.send('mt::rename', payload),
    requestKeybindings: () => ipcRenderer.send('mt::request-keybindings'),
    getPreferenceKeybindings: () => ipcRenderer.invoke('mt::keybinding-get-pref-keybindings'),
    saveUserKeybindings: payload => ipcRenderer.invoke('mt::keybinding-save-user-keybindings', payload),
    reportSelectionChange: (windowId, payload) => ipcRenderer.send('mt::editor-selection-changed', windowId, payload),
    updateFormatMenu: (windowId, payload) => ipcRenderer.send('mt::update-format-menu', windowId, payload),
    respondExport: payload => ipcRenderer.send('mt::response-export', payload),
    respondPrint: () => ipcRenderer.send('mt::response-print'),
    notifyRendererReady: () => ipcRenderer.send('mt::renderer-ready')
  },
  preferences: {
    requestUserPreference: () => ipcRenderer.send('mt::ask-for-user-preference'),
    requestUserData: () => ipcRenderer.send('mt::ask-for-user-data'),
    setUserPreference: payload => ipcRenderer.send('mt::set-user-preference', payload),
    setUserData: payload => ipcRenderer.send('mt::set-user-data', payload),
    setImageFolderPath: value => ipcRenderer.send('mt::ask-for-modify-image-folder-path', value),
    selectDefaultDirectoryToOpen: () => ipcRenderer.send('mt::select-default-directory-to-open'),
    notifyViewLayoutChanged: (windowId, payload) => ipcRenderer.send('mt::view-layout-changed', windowId, payload)
  },
  project: {
    openInSidebar: () => ipcRenderer.send('mt::ask-for-open-project-in-sidebar'),
    updateSidebarMenu: (windowId, visible) => ipcRenderer.send('mt::update-sidebar-menu', windowId, visible)
  },
  spellchecker: {
    setEnabled: enabled => ipcRenderer.invoke('mt::spellchecker-set-enabled', enabled),
    switchLanguage: lang => ipcRenderer.invoke('mt::spellchecker-switch-language', lang),
    getAvailableDictionaries: () => ipcRenderer.invoke('mt::spellchecker-get-available-dictionaries'),
    getCustomDictionaryWords: () => ipcRenderer.invoke('mt::spellchecker-get-custom-dictionary-words'),
    removeCustomDictionaryWord: word => ipcRenderer.invoke('mt::spellchecker-remove-word', word)
  },
  events: {
    on: (channel, handler) => {
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    once: (channel, handler) => {
      ipcRenderer.once(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    off: (channel, handler) => ipcRenderer.removeListener(channel, handler),
    emit: (channel, ...args) => ipcRenderer.emit(channel, ...args)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('mtNative', bridge)
} else {
  window.mtNative = bridge
}
