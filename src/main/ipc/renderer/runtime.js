import { app as electronApp, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { isFile } from 'common/filesystem'
import { getRipgrepPath } from '../../search/ripgrepPath'

const getWindowFromEvent = event => BrowserWindow.fromWebContents(event.sender)

const isUpdatableAtRuntime = () => {
  const resFile = isFile(path.join(process.resourcesPath, 'app-update.yml'))
  if (!resFile) {
    return false
  } else if (process.env.APPIMAGE) {
    return true
  } else if (process.platform === 'win32' && isFile(path.join(process.resourcesPath, 'md.ico'))) {
    return true
  }

  return false
}

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
  ipcMain.on('mt::runtime-is-updatable-sync', event => {
    event.returnValue = isUpdatableAtRuntime()
  })

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
