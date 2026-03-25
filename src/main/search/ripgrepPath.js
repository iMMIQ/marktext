import commandExists from 'command-exists'
import { rgPath } from 'vscode-ripgrep'

// "vscode-ripgrep" is unpacked out of asar because of the binary.
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

export default getRipgrepPath
