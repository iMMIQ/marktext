const fallbackSearchApi = {
  cancel: async () => false,
  searchFiles: async () => [],
  searchText: async () => []
}

const getSearchApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.search) {
    return window.mtNative.search
  }

  return fallbackSearchApi
}

export default {
  cancel: requestId => getSearchApi().cancel(requestId),
  searchFiles: (rootPath, options) => getSearchApi().searchFiles(rootPath, options),
  searchText: (directories, pattern, options) => getSearchApi().searchText(directories, pattern, options)
}
