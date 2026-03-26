const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('phase 4 runtime bridge stays available without Node globals', async () => {
  const { app, page } = await launchElectron([])
  const result = await page.evaluate(async () => {
    const runtime = await window.mtNative.runtime.getInfo()
    const fonts = await window.mtNative.fonts.listFamilies({ onlyMonospace: true })
    const keyboard = await window.mtNative.keyboard.getInfo()

    return {
      hasProcess: typeof window.process !== 'undefined',
      hasRequire: typeof window.require !== 'undefined',
      canAutoUpdate: runtime.update.canAutoUpdate,
      fontsType: Array.isArray(fonts),
      hasKeyboardLayout: typeof keyboard.layout === 'string' || (!!keyboard.layout && typeof keyboard.layout === 'object')
    }
  })

  expect(result.hasProcess).toBe(false)
  expect(result.hasRequire).toBe(false)
  expect(typeof result.canAutoUpdate).toBe('boolean')
  expect(result.fontsType).toBe(true)
  expect(result.hasKeyboardLayout).toBe(true)

  await app.close()
})
