import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import postcssPresetEnv from 'postcss-preset-env'
import { getMarkTextDefines } from './tools/vite/marktextEnvironment'

const rendererRoot = path.resolve(__dirname, 'src/renderer')

export default defineConfig({
  root: rendererRoot,
  base: './',
  plugins: [
    vue()
  ],
  define: {
    ...getMarkTextDefines(),
    global: 'window',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.UNSPLASH_ACCESS_KEY': JSON.stringify(process.env.UNSPLASH_ACCESS_KEY || '')
  },
  css: {
    postcss: {
      plugins: [
        postcssPresetEnv({ stage: 0 })
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      main: path.resolve(__dirname, 'src/main'),
      muya: path.resolve(__dirname, 'src/muya'),
      'electron-log': path.resolve(__dirname, 'src/renderer/shims/electronLog.js'),
      path: 'path-browserify',
      snapsvg: path.resolve(__dirname, 'src/muya/lib/assets/libs/snapSvg.js')
    },
    extensions: ['.mjs', '.js', '.vue', '.json', '.css', '.node']
  },
  server: {
    host: '127.0.0.1',
    port: 9091,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/electron'),
    emptyOutDir: false,
    cssMinify: 'esbuild',
    chunkSizeWarningLimit: 900,
    rollupOptions: {}
  }
})
