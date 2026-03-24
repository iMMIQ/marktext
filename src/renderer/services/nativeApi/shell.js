const fallbackShellApi = {
  openPath: async () => '',
  showItemInFolder: async () => {},
  openExternal: async () => {}
}

const getShellApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.shell) {
    return window.mtNative.shell
  }

  return fallbackShellApi
}

export default {
  openPath: target => getShellApi().openPath(target),
  showItemInFolder: target => getShellApi().showItemInFolder(target),
  openExternal: target => getShellApi().openExternal(target)
}
