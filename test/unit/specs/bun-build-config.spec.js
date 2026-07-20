// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createMainBuildOptions,
  createPreloadBuildOptions,
  createRendererBuildOptions,
  createRendererWorkerBuildOptions,
  repairRendererDocumentAssetUrls
} from '../../../tools/build/marktextBun.mjs'

describe('bun main and preload build config', () => {
  it('emits the main bundle to dist/electron/main.js with shared defines', () => {
    const mainConfig = createMainBuildOptions({ production: false })

    expect(mainConfig.outdir.replace(/\\/g, '/')).toMatch(/dist\/electron$/)
    expect(mainConfig.naming).toEqual({ entry: 'main.js' })
    expect(mainConfig.format).toBe('cjs')
    expect(mainConfig.target).toBe('node')
    expect(mainConfig.define['global.MARKTEXT_VERSION']).toBeTruthy()
    expect(mainConfig.define['global.MARKTEXT_VERSION_STRING']).toBeTruthy()
    expect(mainConfig.define['global.MARKTEXT_IS_STABLE']).toBeTruthy()
    expect(mainConfig.define['process.env.NODE_ENV']).toBe(JSON.stringify(process.env.NODE_ENV || 'production'))
  })

  it('emits the preload bundle to dist/electron/preload.js with shared defines', () => {
    const preloadConfig = createPreloadBuildOptions({ production: false })

    expect(preloadConfig.outdir.replace(/\\/g, '/')).toMatch(/dist\/electron$/)
    expect(preloadConfig.naming).toEqual({ entry: 'preload.js' })
    expect(preloadConfig.format).toBe('cjs')
    expect(preloadConfig.target).toBe('node')
    expect(preloadConfig.define['global.MARKTEXT_VERSION']).toBeTruthy()
    expect(preloadConfig.define['global.MARKTEXT_VERSION_STRING']).toBeTruthy()
    expect(preloadConfig.define['global.MARKTEXT_IS_STABLE']).toBeTruthy()
    expect(preloadConfig.define['process.env.NODE_ENV']).toBe(JSON.stringify(process.env.NODE_ENV || 'production'))
  })

  it('keeps the renderer bundle on the shared Bun Vue transform', () => {
    const rendererConfig = createRendererBuildOptions({ production: false })
    const pluginNames = (rendererConfig.plugins || []).map(plugin => plugin && plugin.name).filter(Boolean)

    expect(pluginNames).toContain('marktext-renderer-aliases')
    expect(pluginNames).toContain('marktext-html-tags')
    expect(pluginNames).toContain('marktext-import-meta-glob')
    expect(pluginNames).toContain('marktext-vue-sfc')
    expect(rendererConfig.entrypoints[0].replace(/\\/g, '/')).toMatch(/src\/renderer\/index\.html$/)
  })

  it('keeps the renderer chunk-size budget explicit', () => {
    const rendererConfig = createRendererBuildOptions({ production: false })

    expect(rendererConfig.splitting).toBe(true)
    expect(rendererConfig.publicPath).toBe('./')
    expect(rendererConfig.naming).toEqual({
      entry: '[name].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]'
    })
    expect(rendererConfig.minify).toBe(false)
  })

  it('uses production minification for renderer chunks', () => {
    const rendererConfig = createRendererBuildOptions({ production: true })

    expect(rendererConfig.minify).toBe(true)
  })

  it('repairs chunk-relative assets for URLs inserted into the renderer document', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-renderer-assets-'))
    const chunk = path.join(root, 'app.js')

    try {
      fs.writeFileSync(chunk, [
        'const icon = "./../assets/icon.png"',
        'const module = "./../assets/snap.svg-min.js"',
        ''
      ].join('\n'), 'utf8')
      await repairRendererDocumentAssetUrls({ outputs: [{ path: chunk }] })
      expect(fs.readFileSync(chunk, 'utf8')).toBe([
        'const icon = "./assets/icon.png"',
        'const module = "./../assets/snap.svg-min.js"',
        ''
      ].join('\n'))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('emits the markdown parser worker as a classic browser worker', () => {
    const workerConfig = createRendererWorkerBuildOptions({ production: false })

    expect(workerConfig.outdir.replace(/\\/g, '/')).toMatch(/dist\/electron\/workers$/)
    expect(workerConfig.target).toBe('browser')
    expect(workerConfig.format).toBe('iife')
    expect(workerConfig.entrypoints[0].replace(/\\/g, '/')).toMatch(/src\/muya\/lib\/workers\/markdownParser\.worker\.js$/)
    expect(workerConfig.naming.entry).toBe('[name].js')
  })
})
