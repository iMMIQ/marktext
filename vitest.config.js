import fs from 'node:fs'
import path from 'path'
import { defineConfig } from 'vitest/config'
import { transformVueSfc } from './tools/build/vueSfcTransform.mjs'

const vueSfcPlugin = {
  name: 'marktext-vue-sfc',
  async load (id) {
    if (!id.endsWith('.vue')) return null
    const source = fs.readFileSync(id, 'utf8')
    return (await transformVueSfc(source, id)).code
  }
}

export default defineConfig({
  plugins: [vueSfcPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      main: path.resolve(__dirname, 'src/main'),
      muya: path.resolve(__dirname, 'src/muya'),
      'electron-log': path.resolve(__dirname, 'src/renderer/shims/electronLog.js'),
      path: 'path-browserify',
      snapsvg: path.resolve(__dirname, 'src/muya/lib/assets/libs/snapSvg.js')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test/unit/setup.js'],
    include: ['test/unit/specs/**/*.spec.js'],
    exclude: ['test/unit/specs/**/*.js_disabled']
  }
})
