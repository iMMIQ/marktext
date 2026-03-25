import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const viteRendererConfig = fs.readFileSync(path.join(root, 'vite.renderer.config.js'), 'utf8')
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

  it('imports the Vue 3 Vite plugin', () => {
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

  it('removes vue-electron from renderer dependencies', () => {
    expect(dependencies['vue-electron']).toBeFalsy()
  })
})
