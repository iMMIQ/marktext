import { BrowserWindow, ipcMain } from 'electron'
import { minimizeWindow, toggleFullScreen } from '../../menu/actions/window'

const getWindowFromEvent = event => BrowserWindow.fromWebContents(event.sender)
const getStateFromWindow = win => ({
  isFullScreen: win.isFullScreen(),
  isMaximized: win.isMaximized()
})

const registerWindowHandlers = windowManager => {
  ipcMain.on('mt::window-minimize', event => {
    minimizeWindow(getWindowFromEvent(event))
  })

  ipcMain.on('mt::window-toggle-maximize', event => {
    const win = getWindowFromEvent(event)
    if (!win) {
      return
    }

    if (win.isFullScreen()) {
      win.setFullScreen(false)
    } else if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('mt::window-close', event => {
    const win = getWindowFromEvent(event)
    if (win) {
      win.close()
    }
  })

  ipcMain.on('mt::window-toggle-full-screen', event => {
    toggleFullScreen(getWindowFromEvent(event))
  })

  ipcMain.handle('mt::window-get-state', event => {
    const win = getWindowFromEvent(event)
    if (!win) {
      return {
        isFullScreen: false,
        isMaximized: false
      }
    }

    const editor = windowManager.get(win.id)
    const browserWindow = editor ? editor.browserWindow : win

    return getStateFromWindow(browserWindow)
  })
}

export default registerWindowHandlers
