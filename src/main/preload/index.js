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
    moveToRelativeFolder: payload => ipcRenderer.invoke('mt::fs-move-to-relative-folder', payload),
    moveImageToFolder: payload => ipcRenderer.invoke('mt::fs-move-image-to-folder', payload),
    uploadImage: payload => ipcRenderer.invoke('mt::fs-upload-image', payload),
    isFileExecutable: filepath => ipcRenderer.invoke('mt::fs-is-file-executable', filepath),
    commandExists: command => ipcRenderer.invoke('mt::fs-command-exists', command),
    readDirectory: pathname => ipcRenderer.invoke('mt::fs-read-directory', pathname),
    readFile: (pathname, encoding) => ipcRenderer.invoke('mt::fs-read-file', pathname, encoding)
  },
  shell: {
    openPath: target => ipcRenderer.invoke('mt::shell-open-path', target),
    showItemInFolder: target => ipcRenderer.invoke('mt::shell-show-item-in-folder', target),
    openExternal: target => ipcRenderer.invoke('mt::shell-open-external', target)
  },
  runtime: {
    getInfo: () => ipcRenderer.invoke('mt::runtime-get-info'),
    isUpdatable: () => ipcRenderer.sendSync('mt::runtime-is-updatable-sync')
  },
  search: {
    cancel: requestId => ipcRenderer.invoke('mt::search-cancel', requestId),
    searchFiles: (rootPath, options) => ipcRenderer.invoke('mt::search-files', rootPath, options),
    searchText: (directories, pattern, options) => ipcRenderer.invoke('mt::search-text', directories, pattern, options)
  },
  app: {
    openSettingsWindow: () => ipcRenderer.send('mt::open-setting-window'),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
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
