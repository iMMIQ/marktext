const fallbackClipboardApi = {
  readFilePath: async () => ''
}

const getClipboardApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.clipboard) {
    return window.mtNative.clipboard
  }

  return fallbackClipboardApi
}

export default {
  readFilePath: () => getClipboardApi().readFilePath()
}
