const fallbackClipboardApi = {
  readFilePath: async () => '',
  readFilePathSync: () => '',
  writeText: () => {}
}

const getClipboardApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.clipboard) {
    return window.mtNative.clipboard
  }

  return fallbackClipboardApi
}

export default {
  readFilePath: () => getClipboardApi().readFilePath(),
  readFilePathSync: () => getClipboardApi().readFilePathSync(),
  writeText: text => getClipboardApi().writeText(text)
}
