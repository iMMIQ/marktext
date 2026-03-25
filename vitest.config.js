import path from 'path'
import { defineConfig } from 'vitest/config'
import { createVuePlugin } from 'vite-plugin-vue2'

export default defineConfig({
  plugins: [createVuePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      muya: path.resolve(__dirname, 'src/muya')
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
