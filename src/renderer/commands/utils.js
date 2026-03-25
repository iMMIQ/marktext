import path from 'path'
import { isFile } from 'common/filesystem'
import { getRuntime } from '../services/runtime'

/// Check whether the package is updatable at runtime.
export const isUpdatable = () => {
  // TODO: If not updatable, allow to check whether there is a new version available.
  const { platform } = getRuntime()
  const resourcesPath = process.resourcesPath

  const resFile = isFile(path.join(resourcesPath, 'app-update.yml'))
  if (!resFile) {
    // No update resource file available.
    return false
  } else if (process.env.APPIMAGE) {
    // We are running as AppImage.
    return true
  } else if (platform === 'win32' && isFile(path.join(resourcesPath, 'md.ico'))) {
    // Windows is a little but tricky. The update resource file is always available and
    // there is no way to check the target type at runtime (electron-builder#4119).
    // As workaround we check whether "md.ico" exists that is only included in the setup.
    return true
  }

  // Otherwise assume that we cannot perform an auto update (standalone binary, archives,
  // packed for package manager).
  return false
}
