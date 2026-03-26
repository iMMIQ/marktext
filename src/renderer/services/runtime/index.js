import nativeRuntime from '../nativeApi/runtime'

let runtime = null
let initialState = null

const mapPlatform = platform => {
  if (!platform || typeof platform !== 'string') {
    return ''
  }

  const normalized = platform.toLowerCase()
  if (normalized.includes('mac')) {
    return 'darwin'
  }
  if (normalized.includes('win')) {
    return 'win32'
  }
  if (normalized.includes('linux')) {
    return 'linux'
  }

  return ''
}

const getBrowserPlatform = () => {
  if (typeof navigator === 'undefined') {
    return ''
  }

  const userAgentDataPlatform = navigator.userAgentData && navigator.userAgentData.platform
  return mapPlatform(userAgentDataPlatform || navigator.platform || navigator.userAgent)
}

const freezeValue = value => {
  if (!value || typeof value !== 'object') {
    return value
  }

  Object.values(value).forEach(freezeValue)
  return Object.freeze(value)
}

export const initializeRuntime = async ({ initialState: nextInitialState = null } = {}) => {
  const runtimeInfo = await nativeRuntime.getInfo()
  runtime = freezeValue({
    platform: runtimeInfo.platform,
    appVersion: runtimeInfo.appVersion,
    env: {
      debug: runtimeInfo.env.debug,
      windowId: runtimeInfo.env.windowId,
      type: runtimeInfo.env.type
    },
    paths: {
      userDataPath: runtimeInfo.paths.userDataPath,
      logPath: runtimeInfo.paths.logPath,
      ripgrepBinaryPath: runtimeInfo.paths.ripgrepBinaryPath
    },
    update: {
      canAutoUpdate: runtimeInfo.update.canAutoUpdate
    }
  })
  initialState = nextInitialState ? freezeValue({ ...nextInitialState }) : null
  return runtime
}

export const getRuntime = () => {
  if (!runtime) {
    throw new Error('Renderer runtime not initialized')
  }
  return runtime
}

export const getPlatform = () => {
  return runtime ? runtime.platform : getBrowserPlatform()
}

export const getInitialState = () => initialState

export const resetRuntime = () => {
  runtime = null
  initialState = null
}
