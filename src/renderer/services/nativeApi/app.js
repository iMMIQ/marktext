const fallbackAppApi = {
  openSettingsWindow: () => {},
  send: () => {},
  sendSync: () => undefined,
  invoke: async () => undefined
}

const getAppApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.app) {
    return window.mtNative.app
  }

  return fallbackAppApi
}

export default {
  openSettingsWindow: () => getAppApi().openSettingsWindow(),
  send: (channel, ...args) => getAppApi().send(channel, ...args),
  sendSync: (channel, ...args) => getAppApi().sendSync(channel, ...args),
  invoke: (channel, ...args) => getAppApi().invoke(channel, ...args)
}
