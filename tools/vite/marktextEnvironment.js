import { builtinModules, createRequire } from 'module'

const require = createRequire(import.meta.url)
const { GitRevisionPlugin } = require('git-revision-webpack-plugin')
const { version, dependencies } = require('../../package.json')

export const getExternalModules = (dependencyMap = dependencies) => {
  return [
    'electron',
    ...builtinModules,
    ...builtinModules.map(name => `node:${name}`),
    ...Object.keys(dependencyMap || {})
  ]
}

export const getMarkTextDefines = () => ({
  ...(() => {
    let shortHash = 'N/A'
    let fullHash = 'N/A'

    try {
      const gitRevisionPlugin = new GitRevisionPlugin()
      shortHash = gitRevisionPlugin.version()
      fullHash = gitRevisionPlugin.commithash()
    } catch (_) {
      // Ignore builds without git metadata.
    }

    const isStableRelease = !!process.env.MARKTEXT_IS_STABLE
    const versionSuffix = isStableRelease ? '' : ` (${shortHash})`
    return {
      'global.MARKTEXT_GIT_SHORT_HASH': JSON.stringify(shortHash),
      'global.MARKTEXT_GIT_HASH': JSON.stringify(fullHash),
      'global.MARKTEXT_VERSION': JSON.stringify(version),
      'global.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}${versionSuffix}`),
      'global.MARKTEXT_IS_STABLE': JSON.stringify(isStableRelease),
      'process.versions.MARKTEXT_VERSION': JSON.stringify(version),
      'process.versions.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}${versionSuffix}`)
    }
  })()
})
