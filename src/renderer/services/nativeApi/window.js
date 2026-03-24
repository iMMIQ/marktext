const fallbackWindowApi = {
  minimize: () => {},
  maximizeOrRestore: () => {},
  close: () => {},
  getState: async () => ({
    isFullScreen: false,
    isMaximized: false
  })
}

const getWindowApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.window) {
    return window.mtNative.window
  }

  return fallbackWindowApi
}

export default {
  minimize: () => getWindowApi().minimize(),
  maximizeOrRestore: () => getWindowApi().maximizeOrRestore(),
  close: () => getWindowApi().close(),
  getState: () => getWindowApi().getState()
}
