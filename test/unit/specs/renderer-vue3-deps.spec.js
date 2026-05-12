import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const { transformVueSfc } = await import(path.join(root, 'tools/build/vueSfcTransform.mjs'))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const bunBuildHelper = fs.readFileSync(path.join(root, 'tools/build/marktextBun.mjs'), 'utf8')
const vueTransform = fs.readFileSync(path.join(root, 'tools/build/vueSfcTransform.mjs'), 'utf8')
const vitestConfig = fs.readFileSync(path.join(root, 'vitest.config.js'), 'utf8')
const rendererMain = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const dependencies = pkg.dependencies ?? {}
const devDependencies = pkg.devDependencies ?? {}

describe('renderer Vue 3 dependency contract', () => {
  it('pins vue to v3', () => {
    expect(devDependencies.vue).toMatch(/^\^3\./)
    expect(dependencies.vue).toBeFalsy()
  })

  it('pins vue-router to v5', () => {
    expect(devDependencies['vue-router']).toMatch(/^\^5\./)
    expect(dependencies['vue-router']).toBeFalsy()
  })

  it('adds pinia to the renderer dependency stack', () => {
    expect(devDependencies.pinia).toBeTruthy()
    expect(dependencies.pinia).toBeFalsy()
  })

  it('uses element-plus instead of element-ui', () => {
    expect(devDependencies['element-plus']).toBeTruthy()
    expect(dependencies['element-plus']).toBeFalsy()
    expect(dependencies['element-ui']).toBeFalsy()
  })

  it('removes temporary Vue compatibility dependencies', () => {
    expect(dependencies['@vue/compat']).toBeFalsy()
    expect(dependencies.vuex).toBeFalsy()
    expect(dependencies['vue-electron']).toBeFalsy()
    expect(devDependencies['vite-plugin-vue2']).toBeFalsy()
  })

  it('uses the shared Vue SFC transform for Bun and Vitest', () => {
    expect(vueTransform).toContain('@vue/compiler-sfc')
    expect(vueTransform).toContain('transformVueSfc')
    expect(vueTransform).toContain('__scopeId')
    expect(bunBuildHelper).toContain('createVuePlugin')
    expect(vitestConfig).toContain('transformVueSfc')
  })

  it('expands nested scoped styles before compiling', async () => {
    const { code } = await transformVueSfc(`
<template><div class="editor-middle"><div class="editor"></div></div></template>
<script>export default {}</script>
<style scoped>
.editor-middle {
  display: flex;
  & > .editor {
    flex: 1;
  }
}
</style>
`, '/tmp/Nesting.vue')

    expect(code).toContain('__scopeId = "data-v-')
    expect(code).toContain('.editor-middle[data-v-')
    expect(code).toContain('> .editor[data-v-')
    expect(code).not.toContain('& > .editor')
  })

  it('removes Vue 2 Vite tooling', () => {
    expect(devDependencies['@vitejs/plugin-vue']).toBeFalsy()
    expect(devDependencies['vite-plugin-vue2']).toBeFalsy()
    expect(devDependencies['vue-template-compiler']).toBeFalsy()
    expect(bunBuildHelper).not.toContain('@vitejs/plugin-vue')
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
