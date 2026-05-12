import { describe, expect, it } from 'vitest'
import { editorWinOptions, preferencesWinOptions, resolvePreloadPath } from '../../../src/main/config'

for (const [name, options] of Object.entries({ editorWinOptions, preferencesWinOptions })) {
  describe(`${name} security defaults`, () => {
    it('uses the sandboxed renderer baseline', () => {
      expect(options.webPreferences.contextIsolation).toBe(true)
      expect(options.webPreferences.sandbox).toBe(true)
      expect(options.webPreferences.nodeIntegration).toBe(false)
      expect(options.webPreferences.webSecurity).toBe(true)
    })
  })
}

describe('preload path', () => {
  it('resolves packaged preload from the app bundle', () => {
    const packagedPath = resolvePreloadPath({
      isPackaged: true,
      getAppPath: () => '/opt/MarkText/resources/app.asar'
    })

    expect(packagedPath.replace(/\\/g, '/')).toBe('/opt/MarkText/resources/app.asar/dist/electron/preload.js')
  })

  it('resolves development preload from the emitted dist directory', () => {
    const devPath = resolvePreloadPath({ isPackaged: false }, '/project/dist/electron')

    expect(devPath.replace(/\\/g, '/')).toBe('/project/dist/electron/preload.js')
  })
})
