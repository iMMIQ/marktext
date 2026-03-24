import { ipcMain, shell } from 'electron'

const registerShellHandlers = () => {
  ipcMain.handle('mt::shell-open-path', async (event, target) => {
    return shell.openPath(target)
  })

  ipcMain.handle('mt::shell-show-item-in-folder', async (event, target) => {
    return shell.showItemInFolder(target)
  })

  ipcMain.handle('mt::shell-open-external', async (event, target) => {
    return shell.openExternal(target)
  })
}

export default registerShellHandlers
