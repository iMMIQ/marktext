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

test('custom title bar actions route through mtNative.window', async () => {
  const { app, page } = await launchElectron()
  const windowState = await page.evaluate(() => window.mtNative.window.getState())
  const bridgeCall = await page.evaluate(async () => {
    const originalMinimize = window.mtNative.window.minimize
    let minimizeCalled = false
    window.mtNative.window.minimize = () => {
      minimizeCalled = true
      return originalMinimize()
    }

    const button = document.querySelector('.frameless-titlebar-minimize')
    if (!button) {
      window.mtNative.window.minimize = originalMinimize
      return { foundButton: false, minimizeCalled: false }
    }

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 200))
    window.mtNative.window.minimize = originalMinimize

    return { foundButton: true, minimizeCalled }
  })
  const isMinimized = await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    return mainWindow ? mainWindow.isMinimized() : false
  })

  await app.close()

  expect(typeof windowState.isFullScreen).toBe('boolean')
  expect(typeof windowState.isMaximized).toBe('boolean')
  expect(bridgeCall.foundButton).toBeTruthy()
  expect(bridgeCall.minimizeCalled).toBeTruthy()
  expect(isMinimized).toBeTruthy()
})
