import path from 'path'
import { createRequire } from 'module'
import { defineConfig } from 'vite'
import { getExternalModules, getMarkTextDefines } from './tools/vite/marktextEnvironment'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

export default defineConfig({
  resolve: {
    alias: {
      common: path.resolve(__dirname, 'src/common')
    }
  },
  define: getMarkTextDefines(),
  build: {
    outDir: 'dist/electron',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/main/preload/index.js'),
      formats: ['cjs'],
      fileName: () => 'preload.js'
    },
    rollupOptions: {
      external: getExternalModules(pkg.dependencies)
    }
  }
})
