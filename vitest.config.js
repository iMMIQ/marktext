import path from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        compatConfig: {
          MODE: 2
        }
      }
    }
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      muya: path.resolve(__dirname, 'src/muya'),
      vue: '@vue/compat'
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
