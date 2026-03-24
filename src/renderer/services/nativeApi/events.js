const fallbackEventsApi = {
  on: () => () => {}
}

const getEventsApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.events) {
    return window.mtNative.events
  }

  return fallbackEventsApi
}

export default {
  on: (channel, handler) => getEventsApi().on(channel, handler)
}
