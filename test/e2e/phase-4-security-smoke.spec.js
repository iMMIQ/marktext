const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('renderer boots without exposing Node globals', async () => {
  const { app, page } = await launchElectron()
  const securityState = await page.evaluate(() => {
    return {
      hasProcess: typeof window.process !== 'undefined',
      hasRequire: typeof window.require !== 'undefined',
      hasBridge: typeof window.mtNative !== 'undefined'
    }
  })

  await app.close()

  expect(securityState.hasProcess).toBe(false)
  expect(securityState.hasRequire).toBe(false)
  expect(securityState.hasBridge).toBe(true)
})
