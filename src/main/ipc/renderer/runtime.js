import { app as electronApp, BrowserWindow, ipcMain } from 'electron'
import { getRipgrepPath } from '../../../renderer/node/paths'

const getWindowFromEvent = event => BrowserWindow.fromWebContents(event.sender)

const getRendererType = event => {
  try {
    const url = new URL(event.sender.getURL())
    const type = url.searchParams.get('type')
    if (type) {
      return type
    }
  } catch (_) {
    // Ignore malformed URLs and fall back to window metadata.
  }

  const win = getWindowFromEvent(event)
  return win ? 'editor' : ''
}

const registerRuntimeHandlers = app => {
  ipcMain.handle('mt::runtime-get-info', event => {
    const win = getWindowFromEvent(event)
    const { env, paths } = app._accessor

    return {
      platform: process.platform,
      appVersion: global.MARKTEXT_VERSION_STRING || `v${electronApp.getVersion()}`,
      env: {
        debug: env.debug,
        windowId: win ? win.id : -1,
        type: getRendererType(event)
      },
      paths: {
        userDataPath: paths.userDataPath,
        logPath: paths.logPath,
        ripgrepBinaryPath: getRipgrepPath()
      }
    }
  })
}

export default registerRuntimeHandlers
