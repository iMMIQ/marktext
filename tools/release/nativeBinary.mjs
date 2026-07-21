import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const platformFormats = Object.freeze({
  darwin: 'Mach-O',
  linux: 'ELF',
  win32: 'PE'
})
const runtimeNativePackages = Object.freeze([
  'ced',
  'fontmanager-redux',
  'keytar',
  'native-keymap'
])

export const detectNativeBinaryFormat = buffer => {
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer.subarray(1, 4).toString('ascii') === 'ELF') return 'ELF'
  if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'MZ') return 'PE'
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0)
    if ([0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe, 0xbebafeca].includes(magic)) return 'Mach-O'
  }
  return 'unknown'
}

export const findNativeModules = root => {
  const modules = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.node')) {
        modules.push(entryPath)
      }
    }
  }

  visit(root)
  return modules.sort()
}

export const findRuntimeNativeBinaries = root => {
  const binaries = runtimeNativePackages.flatMap(packageName => {
    const packageRoot = path.join(root, packageName)
    return fs.existsSync(packageRoot) ? findNativeModules(packageRoot) : []
  })
  const ripgrepRoot = path.join(root, '@vscode', 'ripgrep', 'bin')

  if (fs.existsSync(ripgrepRoot)) {
    for (const filename of ['rg', 'rg.exe']) {
      const binary = path.join(ripgrepRoot, filename)
      if (fs.existsSync(binary) && fs.statSync(binary).isFile()) binaries.push(binary)
    }
  }

  return [...new Set(binaries)].sort()
}

const verifyBinaries = (files, platform) => {
  const expected = platformFormats[platform]
  if (!expected) throw new Error(`Unsupported target platform: ${platform}`)

  return files.map(file => {
    const format = detectNativeBinaryFormat(fs.readFileSync(file).subarray(0, 4))
    return { file, format, expected, valid: format === expected }
  })
}

export const verifyNativeModules = (root, platform) => {
  return verifyBinaries(findNativeModules(root), platform)
}

export const verifyRuntimeNativeBinaries = (root, platform) => {
  return verifyBinaries(findRuntimeNativeBinaries(root), platform)
}

const run = () => {
  const rootIndex = process.argv.indexOf('--root')
  const platformIndex = process.argv.indexOf('--platform')
  const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : 'node_modules')
  const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : process.platform
  if (!fs.existsSync(root)) throw new Error(`Native module root does not exist: ${root}`)

  const results = process.argv.includes('--all')
    ? verifyNativeModules(root, platform)
    : verifyRuntimeNativeBinaries(root, platform)
  if (!results.length) throw new Error(`No runtime native binaries found under ${root}`)

  for (const result of results) {
    console.log(`[${result.valid ? 'ok' : 'error'}] ${path.relative(process.cwd(), result.file)}: ${result.format}; expected ${result.expected}`)
  }

  const invalid = results.filter(result => !result.valid)
  if (invalid.length) {
    throw new Error(`${invalid.length} native module(s) do not match target platform ${platform}.`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    run()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
