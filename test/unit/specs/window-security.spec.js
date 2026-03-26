import { describe, expect, it } from 'vitest'
import { editorWinOptions, preferencesWinOptions } from '../../../src/main/config'

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
