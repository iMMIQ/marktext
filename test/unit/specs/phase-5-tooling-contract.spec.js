// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const babelConfig = fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')
const validateLicenses = fs.readFileSync(path.join(root, 'tools/validateLicenses.js'), 'utf8')
const generateThirdPartyLicense = fs.readFileSync(path.join(root, 'tools/generateThirdPartyLicense.js'), 'utf8')
const legacyLifecycleScripts = [pkg.scripts.preinstall, pkg.scripts.postinstall]
  .filter(Boolean)
  .join('\n')
const allScriptCommands = Object.values(pkg.scripts).join('\n')
const legacyAliasPattern = /\b(?:dev:vite|pack:vite|unit:vite)\b/
const thirdPartyCheckerPattern = /\.electron-vue[\\/]thirdPartyChecker\.js/
const legacyElectronVueFiles = [
  '.electron-vue/preinstall.js',
  '.electron-vue/postinstall.js',
  '.electron-vue/thirdPartyChecker.js'
]

describe('phase 5 tooling contract', () => {
  it('keeps one official script surface and no electron-vue leftovers', () => {
    expect(pkg.scripts.dev || '').not.toContain('dev:vite')
    expect(pkg.scripts.pack || '').not.toContain('pack:vite')
    expect(pkg.scripts.unit || '').not.toContain('unit:vite')
    expect(pkg.scripts.build || '').not.toContain('pack:vite')
    expect(allScriptCommands).not.toMatch(legacyAliasPattern)
    expect(legacyLifecycleScripts).not.toMatch(/\.electron-vue[\\/]/)
    expect(pkg.scripts.format).toBeTruthy()
    expect(pkg.scripts['format:check']).toBeTruthy()
    expect(pkg.scripts['dev:vite']).toBeUndefined()
    expect(pkg.scripts['pack:vite']).toBeUndefined()
    expect(pkg.scripts['unit:vite']).toBeUndefined()
    for (const file of legacyElectronVueFiles) {
      expect(fs.existsSync(path.join(root, file))).toBe(false)
    }
    expect(validateLicenses).not.toMatch(thirdPartyCheckerPattern)
    expect(generateThirdPartyLicense).not.toMatch(thirdPartyCheckerPattern)
    expect(fs.existsSync(path.join(root, 'src/index.ejs'))).toBe(false)
    expect(babelConfig).not.toMatch(/\bnode\s*:\s*16\b|\b['"]node['"]\s*:\s*16\b/)
    expect(babelConfig).not.toContain('element-ui')
  })
})
