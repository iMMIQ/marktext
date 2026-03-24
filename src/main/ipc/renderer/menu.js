import { BrowserWindow, ipcMain } from 'electron'

const registerMenuHandlers = menu => {
  ipcMain.on('mt::menu-popup-application', (event, position = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !menu.has(win.id)) {
      return
    }

    const applicationMenu = menu.getWindowMenuById(win.id)
    if (!applicationMenu) {
      return
    }

    applicationMenu.popup({
      window: win,
      x: position.x,
      y: position.y
    })
  })
}

export default registerMenuHandlers
