// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const babelConfig = fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')
const eslintConfigPath = path.join(root, 'eslint.config.js')
const eslintIgnorePath = path.join(root, '.eslintignore')
const preflightPath = path.join(root, 'tools/install/preflight.js')
const thirdPartyCheckerPath = path.join(root, 'tools/licenses/thirdPartyChecker.js')
const thirdPartyChecker = fs.readFileSync(thirdPartyCheckerPath, 'utf8')
const validateLicenses = fs.readFileSync(path.join(root, 'tools/validateLicenses.js'), 'utf8')
const generateThirdPartyLicense = fs.readFileSync(path.join(root, 'tools/generateThirdPartyLicense.js'), 'utf8')
const bunDevRunner = fs.readFileSync(path.join(root, 'tools/dev/bun-dev-runner.mjs'), 'utf8')
const bunPackScript = fs.readFileSync(path.join(root, 'tools/build/bun-pack.mjs'), 'utf8')
const muyaWebpackConfig = fs.readFileSync(path.join(root, 'src/muya/webpack.config.js'), 'utf8')
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
  '.electron-vue/thirdPartyChecker.js',
  'tools/dev/vite-dev-runner.js',
  'tools/vite/marktextEnvironment.js',
  'vite.main.config.js',
  'vite.preload.config.js',
  'vite.renderer.config.js'
]
const removedDevDependencies = [
  'copy-webpack-plugin',
  'eslint-webpack-plugin',
  'file-loader',
  'html-webpack-plugin',
  'karma',
  'karma-chai',
  'karma-coverage',
  'karma-electron',
  'karma-mocha',
  'karma-sourcemap-loader',
  'karma-spec-reporter',
  'karma-webpack',
  'raw-loader',
  'svg-sprite-loader',
  'svgo-loader',
  'url-loader',
  'vue-loader',
  'vue-style-loader',
  'webpack-bundle-analyzer',
  'webpack-dev-server',
  'webpack-hot-middleware',
  'webpack-merge'
]
const retainedDevDependencies = [
  'webpack',
  'webpack-cli',
  'mini-css-extract-plugin',
  'imports-loader',
  'html-loader'
]

describe('phase 5 tooling contract', () => {
  it('keeps one official script surface and no electron-vue leftovers', () => {
    expect(pkg.scripts.dev).toBe('bun run tools/dev/bun-dev-runner.mjs')
    expect(pkg.scripts.pack).toBe('bun run build:clean && bun run pack:runtime && bun run pack:assets')
    expect(pkg.scripts['pack:runtime']).toBe('bun run tools/build/bun-pack.mjs')
    expect(pkg.scripts.pack || '').not.toContain('pack:vite')
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
    expect(fs.existsSync(eslintConfigPath)).toBe(true)
    expect(fs.existsSync(eslintIgnorePath)).toBe(false)
    expect(pkg.scripts.lint).not.toContain('ESLINT_USE_FLAT_CONFIG=false')
    expect(pkg.scripts.lint).toContain(eslintSurface)
    expect(pkg.scripts['lint:fix']).not.toContain('ESLINT_USE_FLAT_CONFIG=false')
    expect(pkg.scripts.format).not.toContain('ESLINT_USE_FLAT_CONFIG=false')
    expect(pkg.scripts.format).toContain(`--fix ${eslintSurface}`)
    expect(pkg.scripts['format:check']).toBe('bun run lint')
    expect(validateLicenses).toMatch(movedThirdPartyCheckerPattern)
    expect(generateThirdPartyLicense).toMatch(movedThirdPartyCheckerPattern)
    expect(thirdPartyChecker).toContain('EPL-2.0')
  })

  it('removes obsolete webpack and karma era tooling dependencies', () => {
    for (const dependency of removedDevDependencies) {
      expect(pkg.devDependencies?.[dependency], dependency).toBeUndefined()
    }

    for (const dependency of retainedDevDependencies) {
      expect(pkg.devDependencies?.[dependency], dependency).toBeTruthy()
    }
  })

  it('keeps the dev runner compatible with the installed chokidar major', () => {
    expect(pkg.dependencies?.chokidar).toMatch(/^\^5\./)
    expect(bunDevRunner).toContain("await import('chokidar')")
    expect(bunDevRunner).not.toContain("require('chokidar')")
    expect(bunDevRunner).toContain('serveBuiltRenderer')
    expect(bunDevRunner).toContain('MARKTEXT_DEV_SERVER_PORT')
    expect(bunDevRunner).toContain('Renderer dev server listening on')
    expect(bunPackScript).toContain('Bun.build')
  })

  it('keeps the Muya webpack config on supported imports-loader syntax', () => {
    expect(pkg.devDependencies?.['imports-loader']).toMatch(/^\^5\./)
    expect(muyaWebpackConfig).toContain("loader: 'imports-loader'")
    expect(muyaWebpackConfig).toContain("additionalCode: 'module.exports = 0;'")
    expect(muyaWebpackConfig).toContain("wrapper: 'window'")
    expect(muyaWebpackConfig).not.toContain('imports-loader?')
  })
})
