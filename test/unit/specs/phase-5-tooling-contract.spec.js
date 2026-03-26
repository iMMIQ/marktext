// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const babelConfig = fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')
const preflightPath = path.join(root, 'tools/install/preflight.js')
const thirdPartyCheckerPath = path.join(root, 'tools/licenses/thirdPartyChecker.js')
const thirdPartyChecker = fs.readFileSync(thirdPartyCheckerPath, 'utf8')
const validateLicenses = fs.readFileSync(path.join(root, 'tools/validateLicenses.js'), 'utf8')
const generateThirdPartyLicense = fs.readFileSync(path.join(root, 'tools/generateThirdPartyLicense.js'), 'utf8')
const legacyLifecycleScripts = [pkg.scripts.preinstall, pkg.scripts.postinstall]
  .filter(Boolean)
  .join('\n')
const allScriptCommands = Object.values(pkg.scripts).join('\n')
const legacyAliasPattern = /\b(?:dev:vite|pack:vite|unit:vite)\b/
const thirdPartyCheckerPattern = /\.electron-vue[\\/]thirdPartyChecker\.js/
const movedThirdPartyCheckerPattern = /\.\/licenses\/thirdPartyChecker/
const eslintSurface = 'src test tools *.config.js'
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

  it('locks the moved install and license helpers into the task 2 contract', () => {
    expect(fs.existsSync(preflightPath)).toBe(true)
    expect(fs.existsSync(thirdPartyCheckerPath)).toBe(true)
    expect(pkg.scripts.preinstall).toBe('node tools/install/preflight.js')
    expect(pkg.engines.node).toBe('24.x')
    expect(pkg.scripts.lint).toContain(eslintSurface)
    expect(pkg.scripts.format).toContain(`--fix ${eslintSurface}`)
    expect(pkg.scripts['format:check']).toBe('yarn run lint')
    expect(validateLicenses).toMatch(movedThirdPartyCheckerPattern)
    expect(generateThirdPartyLicense).toMatch(movedThirdPartyCheckerPattern)
    expect(thirdPartyChecker).toContain('EPL-2.0')
  })
})
