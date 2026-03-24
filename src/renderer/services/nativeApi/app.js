const fallbackAppApi = {
  openSettingsWindow: () => {}
}

const getAppApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.app) {
    return window.mtNative.app
  }

  return fallbackAppApi
}

export default {
  openSettingsWindow: () => getAppApi().openSettingsWindow()
}
