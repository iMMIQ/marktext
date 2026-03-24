import { contextBridge, ipcRenderer } from 'electron'

const bridge = {
  window: {
    minimize: () => ipcRenderer.send('mt::window-minimize'),
    maximizeOrRestore: () => ipcRenderer.send('mt::window-toggle-maximize'),
    close: () => ipcRenderer.send('mt::window-close'),
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
  shell: {
    openPath: target => ipcRenderer.invoke('mt::shell-open-path', target),
    showItemInFolder: target => ipcRenderer.invoke('mt::shell-show-item-in-folder', target),
    openExternal: target => ipcRenderer.invoke('mt::shell-open-external', target)
  },
  app: {
    openSettingsWindow: () => ipcRenderer.send('mt::open-setting-window')
  },
  events: {
    on: (channel, handler) => {
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('mtNative', bridge)
} else {
  window.mtNative = bridge
}
