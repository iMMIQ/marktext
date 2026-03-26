import { getRuntime } from '../services/runtime'

/// Check whether the package is updatable at runtime.
export const isUpdatable = () => {
  try {
    return getRuntime().update.canAutoUpdate
  } catch {
    return false
  }
}
