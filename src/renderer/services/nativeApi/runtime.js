const fallbackRuntimeApi = {
  getInfo: async () => {
    throw new Error('Renderer runtime bridge is unavailable')
  }
}

const getRuntimeApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.runtime) {
    return window.mtNative.runtime
  }

  return fallbackRuntimeApi
}

export default {
  getInfo: () => getRuntimeApi().getInfo()
}
