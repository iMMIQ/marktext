// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const storesRoot = path.join(root, 'src/renderer/stores')
const legacyModuleDispatcher = path.join(storesRoot, 'moduleDispatcher.js')
const legacyModulesDir = path.join(storesRoot, 'modules')
const mainEntry = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const mixinsEntry = fs.readFileSync(path.join(root, 'src/renderer/mixins/index.js'), 'utf8')
const typedBridgeWriteSet = [
  'src/renderer/main.js',
  'src/renderer/bootstrap.js',
  'src/renderer/commands/index.js',
  'src/renderer/commands/quickOpen.js',
  'src/renderer/components/import/index.vue',
  'src/renderer/mixins/index.js',
  'src/renderer/prefComponents/keybindings/KeybindingConfigurator.js',
  'src/renderer/prefComponents/keybindings/index.vue',
  'src/renderer/prefComponents/spellchecker/index.vue',
  'src/renderer/spellchecker/index.js',
  'src/renderer/stores/autoUpdates.js',
  'src/renderer/stores/editor.js',
  'src/renderer/stores/layout.js',
  'src/renderer/stores/preferences.js',
  'src/renderer/stores/project.js'
].map(file => ({
  file,
  source: fs.readFileSync(path.join(root, file), 'utf8')
}))
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

describe('phase 5 store and bridge boundary', () => {
  it('removes migration-only store adapters and string bootstrap calls', () => {
    expect(fs.existsSync(legacyModuleDispatcher)).toBe(false)
    expect(fs.existsSync(legacyModulesDir)).toBe(false)
    expect(storeFiles).not.toMatch(/\bmoduleDispatcher\b|['"]\.\/modules\//)
    expect(mainEntry).not.toMatch(/\.(dispatch|commit)\(\s*['"`]/)
    expect(mixinsEntry).not.toMatch(/\.(dispatch|commit)\(\s*['"`]/)
  })

  it('removes generic app send and invoke bridge calls from the task 4 renderer write set', () => {
    for (const { file, source } of typedBridgeWriteSet) {
      expect(source, file).not.toMatch(/\bapp\.(send|invoke)\s*\(/)
      expect(source, file).not.toMatch(/\$nativeApi\.app\.(send|invoke)\s*\(/)
    }
  })
})
