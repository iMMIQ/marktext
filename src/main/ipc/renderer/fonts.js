import { ipcMain } from 'electron'
import { listFontFamilies } from '../../native/fontManager'

const registerFontsHandlers = () => {
  ipcMain.handle('mt::fonts-list-families', async (event, options) => {
    return listFontFamilies(options)
  })
}

export default registerFontsHandlers
