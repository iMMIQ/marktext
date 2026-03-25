import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const viteRendererConfig = fs.readFileSync(path.join(root, 'vite.renderer.config.js'), 'utf8')

describe('renderer Vue 3 dependency contract', () => {
  it('uses the Vue 3 renderer stack', () => {
    expect(pkg.dependencies.vue).toMatch(/^\^3\./)
    expect(pkg.dependencies['vue-router']).toMatch(/^\^4\./)
    expect(pkg.dependencies.pinia).toBeTruthy()
    expect(pkg.dependencies['element-plus']).toBeTruthy()
    expect(viteRendererConfig).toMatch(/@vitejs\/plugin-vue/)
  })
})
