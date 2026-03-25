import { ipcMain } from 'electron'
import FileSearcher from '../../search/fileSearcher'
import RipgrepDirectorySearcher from '../../search/ripgrepDirectorySearcher'

const activeSearches = new Map()

const getSearchKey = (event, requestId) => {
  if (!requestId) {
    return null
  }

  return `${event.sender.id}:${requestId}`
}

const registerCancelableSearch = (searchKey, searchPromise) => {
  if (!searchKey) {
    return
  }

  activeSearches.set(searchKey, () => {
    if (searchPromise.cancel) {
      searchPromise.cancel()
    }
  })
}

const clearCancelableSearch = searchKey => {
  if (searchKey) {
    activeSearches.delete(searchKey)
  }
}

const registerSearchHandlers = () => {
  ipcMain.handle('mt::search-cancel', async (event, requestId) => {
    const searchKey = getSearchKey(event, requestId)
    const cancel = activeSearches.get(searchKey)
    if (!cancel) {
      return false
    }

    cancel()
    activeSearches.delete(searchKey)
    return true
  })

  ipcMain.handle('mt::search-files', async (event, rootPath, options = {}) => {
    if (!rootPath) {
      return []
    }

    const results = []
    const searcher = new FileSearcher()
    const { requestId, maxResults = Infinity } = options
    const searchKey = getSearchKey(event, requestId)
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
    registerCancelableSearch(searchKey, searchPromise)
    try {
      await searchPromise
    } finally {
      clearCancelableSearch(searchKey)
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
    const searchKey = getSearchKey(event, requestId)
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
    registerCancelableSearch(searchKey, searchPromise)
    try {
      await searchPromise
    } finally {
      clearCancelableSearch(searchKey)
    }

    return results
  })
}

export default registerSearchHandlers
