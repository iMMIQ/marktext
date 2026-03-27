// @vitest-environment node
import { describe, expect, it } from 'vitest'
import mainConfig from '../../../vite.main.config'
import preloadConfig from '../../../vite.preload.config'
import rendererConfig from '../../../vite.renderer.config'

describe('vite main and preload build config', () => {
  it('emits the main bundle to dist/electron/main.js with shared defines', () => {
    expect(mainConfig.build.outDir).toBe('dist/electron')
    expect(mainConfig.build.lib.entry.replace(/\\/g, '/')).toMatch(/src\/main\/index\.js$/)
    expect(mainConfig.build.lib.fileName()).toBe('main.js')
    expect(mainConfig.define['global.MARKTEXT_VERSION']).toBeTruthy()
    expect(mainConfig.define['global.MARKTEXT_VERSION_STRING']).toBeTruthy()
    expect(mainConfig.define['global.MARKTEXT_IS_STABLE']).toBeTruthy()
  })

  it('emits the preload bundle to dist/electron/preload.js with shared defines', () => {
    expect(preloadConfig.build.outDir).toBe('dist/electron')
    expect(preloadConfig.build.lib.entry.replace(/\\/g, '/')).toMatch(/src\/main\/preload\/index\.js$/)
    expect(preloadConfig.build.lib.fileName()).toBe('preload.js')
    expect(preloadConfig.define['global.MARKTEXT_VERSION']).toBeTruthy()
    expect(preloadConfig.define['global.MARKTEXT_VERSION_STRING']).toBeTruthy()
    expect(preloadConfig.define['global.MARKTEXT_IS_STABLE']).toBeTruthy()
  })

  it('keeps the renderer build free of the legacy codemirror asset plugin', () => {
    const pluginNames = (rendererConfig.plugins || []).map(plugin => plugin && plugin.name).filter(Boolean)

    expect(pluginNames).not.toContain('marktext-codemirror-assets')
  })
})
