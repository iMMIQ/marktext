import { ipcMain } from 'electron'
import FileSearcher from '../../search/fileSearcher'
import RipgrepDirectorySearcher from '../../search/ripgrepDirectorySearcher'

const noop = () => {}

const registerSearchHandlers = () => {
  ipcMain.handle('mt::search-files', async (event, rootPath, options = {}) => {
    if (!rootPath) {
      return []
    }

    const results = []
    const searcher = new FileSearcher()
    await searcher.search([rootPath], '', {
      ...options,
      didMatch: result => results.push(result),
      didSearchPaths: noop
    })

    return results
  })

  ipcMain.handle('mt::search-text', async (event, directories = [], pattern = '', options = {}) => {
    if (!Array.isArray(directories) || directories.length === 0) {
      return []
    }

    const results = []
    const searcher = new RipgrepDirectorySearcher()
    await searcher.search(directories, pattern, {
      ...options,
      didMatch: result => results.push(result),
      didSearchPaths: noop
    })

    return results
  })
}

export default registerSearchHandlers
