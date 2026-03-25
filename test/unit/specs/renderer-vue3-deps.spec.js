import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const viteRendererConfig = fs.readFileSync(path.join(root, 'vite.renderer.config.js'), 'utf8')
const vitestConfig = fs.readFileSync(path.join(root, 'vitest.config.js'), 'utf8')
const rendererMain = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const dependencies = pkg.dependencies ?? {}
const devDependencies = pkg.devDependencies ?? {}
const vuePluginImportPattern = /import\s+(\w+)\s+from\s+['"]@vitejs\/plugin-vue['"]/

describe('renderer Vue 3 dependency contract', () => {
  it('pins vue to v3', () => {
    expect(dependencies.vue).toMatch(/^\^3\./)
  })

  it('pins vue-router to v4', () => {
    expect(dependencies['vue-router']).toMatch(/^\^4\./)
  })

  it('adds pinia to the renderer dependency stack', () => {
    expect(dependencies.pinia).toBeTruthy()
  })

  it('uses element-plus instead of element-ui', () => {
    expect(dependencies['element-plus']).toBeTruthy()
    expect(dependencies['element-ui']).toBeFalsy()
  })

  it('removes temporary Vue compatibility dependencies', () => {
    expect(dependencies['@vue/compat']).toBeFalsy()
    expect(dependencies.vuex).toBeFalsy()
    expect(dependencies['vue-electron']).toBeFalsy()
    expect(devDependencies['vite-plugin-vue2']).toBeFalsy()
  })

  it('imports the Vue 3 Vite plugin', () => {
    expect(devDependencies['@vitejs/plugin-vue']).toBeTruthy()
    expect(viteRendererConfig).toMatch(vuePluginImportPattern)
  })

  it('registers the imported Vue 3 Vite plugin', () => {
    const pluginFactory = viteRendererConfig.match(vuePluginImportPattern)?.[1] ?? '__missing_vue_plugin__'

    expect(pluginFactory).not.toBe('__missing_vue_plugin__')
    expect(viteRendererConfig).toMatch(new RegExp(`\\b${pluginFactory}\\s*\\(`))
  })

  it('removes Vue 2 Vite tooling', () => {
    expect(viteRendererConfig).not.toMatch(/from\s+['"]vite-plugin-vue2['"]/)
    expect(viteRendererConfig).not.toMatch(/\bcreateVuePlugin\s*\(/)
    expect(devDependencies['vite-plugin-vue2']).toBeFalsy()
    expect(devDependencies['vue-template-compiler']).toBeFalsy()
  })

  it('removes Vue compatibility aliases from test and renderer configs', () => {
    expect(viteRendererConfig).not.toMatch(/compatConfig/)
    expect(viteRendererConfig).not.toMatch(/@vue\/compat/)
    expect(vitestConfig).not.toMatch(/compatConfig/)
    expect(vitestConfig).not.toMatch(/@vue\/compat/)
  })

  it('boots the renderer without the legacy store bridge', () => {
    expect(rendererMain).not.toMatch(/configureCompat/)
    expect(rendererMain).not.toMatch(/legacyBridge/)
    expect(rendererMain).not.toMatch(/\$store/)
  })

  it('deletes the old Vuex store tree', () => {
    const oldStoreFiles = [
      'src/renderer/store/index.js',
      'src/renderer/store/autoUpdates.js',
      'src/renderer/store/commandCenter.js',
      'src/renderer/store/editor.js',
      'src/renderer/store/help.js',
      'src/renderer/store/layout.js',
      'src/renderer/store/listenForMain.js',
      'src/renderer/store/notification.js',
      'src/renderer/store/preferences.js',
      'src/renderer/store/project.js',
      'src/renderer/store/treeCtrl.js',
      'src/renderer/store/tweet.js'
    ]

    oldStoreFiles.forEach(file => {
      expect(fs.existsSync(path.join(root, file))).toBe(false)
    })
  })
})
