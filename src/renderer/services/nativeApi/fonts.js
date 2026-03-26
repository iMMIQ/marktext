const fallbackFontsApi = {
  listFamilies: async () => []
}

const getFontsApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.fonts) {
    return window.mtNative.fonts
  }

  return fallbackFontsApi
}

export default {
  listFamilies: options => getFontsApi().listFamilies(options)
}
