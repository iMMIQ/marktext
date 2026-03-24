import { ipcMain } from 'electron'

const registerAppHandlers = app => {
  ipcMain.on('mt::open-setting-window', () => {
    app._openSettingsWindow()
  })
}

export default registerAppHandlers
