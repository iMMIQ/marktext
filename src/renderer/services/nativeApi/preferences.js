const fallbackPreferencesApi = {
  requestUserPreference: () => {},
  requestUserData: () => {},
  setUserPreference: () => {},
  setUserData: () => {},
  setImageFolderPath: () => {},
  selectDefaultDirectoryToOpen: () => {},
  notifyViewLayoutChanged: () => {}
}

const getPreferencesApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.preferences) {
    return window.mtNative.preferences
  }

  return fallbackPreferencesApi
}

export default {
  requestUserPreference: () => getPreferencesApi().requestUserPreference(),
  requestUserData: () => getPreferencesApi().requestUserData(),
  setUserPreference: payload => getPreferencesApi().setUserPreference(payload),
  setUserData: payload => getPreferencesApi().setUserData(payload),
  setImageFolderPath: value => getPreferencesApi().setImageFolderPath(value),
  selectDefaultDirectoryToOpen: () => getPreferencesApi().selectDefaultDirectoryToOpen(),
  notifyViewLayoutChanged: (windowId, payload) => getPreferencesApi().notifyViewLayoutChanged(windowId, payload)
}
