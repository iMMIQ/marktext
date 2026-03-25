import { builtinModules, createRequire } from 'module'

const require = createRequire(import.meta.url)
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
  'global.MARKTEXT_VERSION': JSON.stringify(version),
  'global.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}`),
  'process.versions.MARKTEXT_VERSION': JSON.stringify(version),
  'process.versions.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}`)
})
