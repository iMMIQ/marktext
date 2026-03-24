import commandExists from 'command-exists'
import { rgPath } from 'vscode-ripgrep'
import EnvPaths from 'common/envPaths'

// // "vscode-ripgrep" is unpacked out of asar because of the binary.
const rgDiskPath = rgPath.replace(/\bapp\.asar\b/, 'app.asar.unpacked')

export const getRipgrepPath = ({
  env = process.env,
  hasCommand = commandExists.sync,
  bundledRipgrepPath = rgDiskPath
} = {}) => {
  if (env.MARKTEXT_RIPGREP_PATH) {
    return env.MARKTEXT_RIPGREP_PATH
  }

  if (hasCommand('rg')) {
    return 'rg'
  }

  return bundledRipgrepPath
}

class RendererPaths extends EnvPaths {
  /**
   * Configure and sets all application paths.
   *
   * @param {string} userDataPath The user data path.
   */
  constructor (userDataPath) {
    if (!userDataPath) {
      throw new Error('No user data path is given.')
    }

    // Initialize environment paths
    super(userDataPath)

    // Prefer an explicitly configured ripgrep binary, then a system installation,
    // and finally the dependency-provided binary.
    this._ripgrepBinaryPath = getRipgrepPath()
  }

  // Returns the path to ripgrep on disk.
  get ripgrepBinaryPath () {
    return this._ripgrepBinaryPath
  }
}

export default RendererPaths
