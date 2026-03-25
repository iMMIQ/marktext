import runtime from '../services/nativeApi/runtime'

/// Check whether the package is updatable at runtime.
export const isUpdatable = () => {
  return runtime.isUpdatable()
}
