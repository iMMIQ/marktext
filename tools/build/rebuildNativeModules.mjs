import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rebuild } from '@electron/rebuild'

const require = createRequire(import.meta.url)
const { version: electronVersion } = require('electron/package.json')
const electronBinary = require('electron')

const onlyModules = ['keytar', 'native-keymap', 'fontmanager-redux', 'ced']
const cacheDir = path.resolve(process.cwd(), 'node_modules', '.cache', 'marktext')
const cacheFile = path.join(cacheDir, 'native-rebuild.json')
const forceRebuild = process.env.MARKTEXT_FORCE_NATIVE_REBUILD === '1'
const forceABI = Number(execFileSync(
  electronBinary,
  ['-p', 'process.versions.modules'],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    }
  }
).toString().trim())

const findPackageJsonPath = specifier => {
  let currentDir = path.dirname(require.resolve(specifier))

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json')

    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate package.json for ${specifier}`)
    }

    currentDir = parentDir
  }
}

const { version: rebuildVersion } = JSON.parse(fs.readFileSync(findPackageJsonPath('@electron/rebuild'), 'utf8'))

const getModuleMetadata = moduleName => {
  const packageJsonPath = findPackageJsonPath(moduleName)
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  return {
    name: moduleName,
    version: packageJson.version,
    path: path.relative(process.cwd(), path.dirname(packageJsonPath))
  }
}

const getManifest = () => {
  const inputs = {
    electronVersion,
    rebuildVersion,
    forceABI,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    onlyModules: onlyModules.map(getModuleMetadata)
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(inputs))
    .digest('hex')

  return {
    fingerprint,
    inputs
  }
}

const readCachedManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch {
    return null
  }
}

const writeCachedManifest = manifest => {
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify({
    ...manifest,
    updatedAt: new Date().toISOString()
  }, null, 2))
}

const manifest = getManifest()
const cachedManifest = readCachedManifest()

if (!forceRebuild && cachedManifest?.fingerprint === manifest.fingerprint) {
  console.log('Native modules are up to date; skipping rebuild. Use `bun run rebuild:force` to rebuild anyway.')
  process.exit(0)
}

if (forceRebuild) {
  console.log('Forcing native module rebuild...')
}

rebuild({
  buildPath: path.resolve(process.cwd()),
  electronVersion,
  forceABI,
  force: true,
  onlyModules
})
  .then(() => {
    writeCachedManifest(manifest)
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
