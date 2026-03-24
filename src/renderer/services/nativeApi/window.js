const fallbackWindowApi = {
  minimize: () => {},
  maximizeOrRestore: () => {},
  toggleFullScreen: () => {},
  close: () => {},
  setZoomFactor: () => {},
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
  toggleFullScreen: () => getWindowApi().toggleFullScreen(),
  close: () => getWindowApi().close(),
  setZoomFactor: value => getWindowApi().setZoomFactor(value),
  getState: () => getWindowApi().getState()
}
