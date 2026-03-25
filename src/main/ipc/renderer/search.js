import { ipcMain } from 'electron'
import FileSearcher from '../../search/fileSearcher'
import RipgrepDirectorySearcher from '../../search/ripgrepDirectorySearcher'

const activeSearches = new Map()

const registerCancelableSearch = (requestId, searchPromise) => {
  if (!requestId) {
    return
  }

  activeSearches.set(requestId, () => {
    if (searchPromise.cancel) {
      searchPromise.cancel()
    }
  })
}

const clearCancelableSearch = requestId => {
  if (requestId) {
    activeSearches.delete(requestId)
  }
}

const registerSearchHandlers = () => {
  ipcMain.handle('mt::search-cancel', async (event, requestId) => {
    const cancel = activeSearches.get(requestId)
    if (!cancel) {
      return false
    }

    cancel()
    activeSearches.delete(requestId)
    return true
  })

  ipcMain.handle('mt::search-files', async (event, rootPath, options = {}) => {
    if (!rootPath) {
      return []
    }

    const results = []
    const searcher = new FileSearcher()
    const { requestId, maxResults = Infinity } = options
    let limitReached = false
    const searchPromise = searcher.search([rootPath], '', {
      ...options,
      didMatch: result => {
        if (!limitReached && results.length < maxResults) {
          results.push(result)
        }
      },
      didSearchPaths: numPathsFound => {
        if (numPathsFound > maxResults && searchPromise.cancel) {
          limitReached = true
          searchPromise.cancel()
        }
      }
    })
    registerCancelableSearch(requestId, searchPromise)
    try {
      await searchPromise
    } finally {
      clearCancelableSearch(requestId)
    }

    return results
  })

  ipcMain.handle('mt::search-text', async (event, directories = [], pattern = '', options = {}) => {
    if (!Array.isArray(directories) || directories.length === 0) {
      return []
    }

    const results = []
    const searcher = new RipgrepDirectorySearcher()
    const { requestId, maxResults = Infinity } = options
    let limitReached = false
    const searchPromise = searcher.search(directories, pattern, {
      ...options,
      didMatch: result => {
        if (!limitReached && results.length < maxResults) {
          results.push(result)
        }
      },
      didSearchPaths: numPathsFound => {
        if (numPathsFound > maxResults && searchPromise.cancel) {
          limitReached = true
          searchPromise.cancel()
        }
      }
    })
    registerCancelableSearch(requestId, searchPromise)
    try {
      await searchPromise
    } finally {
      clearCancelableSearch(requestId)
    }

    return results
  })
}

export default registerSearchHandlers
