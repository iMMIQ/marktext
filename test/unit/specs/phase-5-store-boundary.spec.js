// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const storesRoot = path.join(root, 'src/renderer/stores')
const rendererRoot = path.join(root, 'src/renderer')
const legacyModuleDispatcher = path.join(storesRoot, 'moduleDispatcher.js')
const legacyModulesDir = path.join(storesRoot, 'modules')
const mainEntry = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const walk = directory => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    const filePath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(filePath) : [filePath]
  })

const storeFiles = walk(storesRoot)
  .filter(file => file.endsWith('.js'))
  .filter(file => file !== legacyModuleDispatcher)
  .filter(file => !file.startsWith(`${legacyModulesDir}${path.sep}`))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n')
const rendererFiles = walk(rendererRoot)
  .filter(file => /\.(js|vue)$/.test(file))
  .filter(file => file !== path.join(rendererRoot, 'services/nativeApi/app.js'))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n')

describe('phase 5 store and bridge boundary', () => {
  it('removes migration-only store adapters and generic app passthroughs', () => {
    expect(fs.existsSync(legacyModuleDispatcher)).toBe(false)
    expect(fs.existsSync(legacyModulesDir)).toBe(false)
    expect(storeFiles).not.toMatch(/\bmoduleDispatcher\b|['"]\.\/modules\//)
    expect(mainEntry).not.toMatch(/\.(dispatch|commit)\(\s*['"`]/)
    expect(preload).not.toMatch(/\b(send|invoke):\s*\(\s*channel\b/)
    expect(rendererFiles).not.toMatch(/\$nativeApi\.app\.(send|invoke)\(|\bnativeApi\.app\.(send|invoke)\(|\bapp\.(send|invoke)\(/)
  })
})
