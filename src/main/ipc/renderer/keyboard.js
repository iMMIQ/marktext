import { ipcMain } from 'electron'
import { dumpKeyboardInfo, getKeyboardInfo } from '../../keyboard'

const registerKeyboardHandlers = () => {
  ipcMain.handle('mt::keyboard-get-info', async () => {
    return getKeyboardInfo()
  })

  ipcMain.on('mt::keyboard-dump-info', () => {
    dumpKeyboardInfo()
  })
}

export default registerKeyboardHandlers
