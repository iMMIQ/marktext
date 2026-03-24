const noop = () => {}

const fallbackEventsApi = {
  on: () => noop,
  once: () => noop,
  off: () => {},
  emit: () => {}
}

const getEventsApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.events) {
    return window.mtNative.events
  }

  return fallbackEventsApi
}

export default {
  on: (channel, handler) => getEventsApi().on(channel, handler),
  once: (channel, handler) => getEventsApi().once(channel, handler),
  off: (channel, handler) => getEventsApi().off(channel, handler),
  emit: (channel, ...args) => getEventsApi().emit(channel, ...args)
}
