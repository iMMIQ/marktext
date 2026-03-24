import plist from 'plist'
import { clipboard, ipcMain } from 'electron'
import { isLinux, isOsx, isWindows } from '../../config'

const readClipboardFilePath = () => {
  if (isLinux) {
    return ''
  }

  if (isOsx) {
    if (!clipboard.has('NSFilenamesPboardType')) {
      return ''
    }

    const result = plist.parse(clipboard.read('NSFilenamesPboardType'))
    return Array.isArray(result) && result.length ? result[0] : ''
  }

  if (isWindows) {
    const rawFilePath = clipboard.read('FileNameW')
    if (!rawFilePath) {
      return ''
    }

    const filePath = rawFilePath.replace(new RegExp(String.fromCharCode(0), 'g'), '')
    return typeof filePath === 'string' ? filePath : ''
  }

  return ''
}

const registerClipboardHandlers = () => {
  ipcMain.handle('mt::clipboard-read-file-path', () => {
    return readClipboardFilePath()
  })

  ipcMain.on('mt::clipboard-read-file-path-sync', event => {
    event.returnValue = readClipboardFilePath()
  })

  ipcMain.on('mt::clipboard-write-text', (event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '')
  })
}

export default registerClipboardHandlers
