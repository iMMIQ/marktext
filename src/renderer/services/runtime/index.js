import nativeRuntime from '../nativeApi/runtime'

let runtime = null
let initialState = null

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
    ...runtimeInfo,
    env: {
      ...runtimeInfo.env
    },
    paths: {
      ...runtimeInfo.paths
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

export const getInitialState = () => initialState

export const resetRuntime = () => {
  runtime = null
  initialState = null
}
