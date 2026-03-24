const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('renderer exposes the native bridge contract', async () => {
  const { app, page } = await launchElectron()
  const bridgeShape = await page.evaluate(() => {
    const bridge = window.mtNative
    return bridge ? Object.keys(bridge).sort() : null
  })

  await app.close()

  expect(bridgeShape).toEqual([
    'app',
    'clipboard',
    'events',
    'menu',
    'shell',
    'window'
  ])
})
