const fallbackKeyboardApi = {
  getInfo: async () => ({
    layout: '',
    keymap: {}
  }),
  dumpInfo: () => {}
}

const getKeyboardApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.keyboard) {
    return window.mtNative.keyboard
  }

  return fallbackKeyboardApi
}

export default {
  getInfo: () => getKeyboardApi().getInfo(),
  dumpInfo: () => getKeyboardApi().dumpInfo()
}
