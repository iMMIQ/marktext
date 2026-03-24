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
  const platform = await app.evaluate(() => process.platform)
  if (platform === 'darwin') {
    await page.waitForSelector('.title-bar .title')
  } else {
    await page.waitForSelector('.frameless-titlebar-minimize')
  }
  const windowState = await page.evaluate(() => window.mtNative.window.getState())
  const bridgeCall = await page.evaluate(async () => {
    const isMacOS = window.navigator.platform.toLowerCase().includes('mac')

    if (isMacOS) {
      const originalMaximizeOrRestore = window.mtNative.window.maximizeOrRestore
      let maximizeOrRestoreCalled = false
      window.mtNative.window.maximizeOrRestore = () => {
        maximizeOrRestoreCalled = true
        return originalMaximizeOrRestore()
      }

      const title = document.querySelector('.title-bar .title')
      if (!title) {
        window.mtNative.window.maximizeOrRestore = originalMaximizeOrRestore
        return { interaction: 'maximize-or-restore', foundTarget: false, bridgeMethodCalled: false }
      }

      title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 200))
      window.mtNative.window.maximizeOrRestore = originalMaximizeOrRestore

      return { interaction: 'maximize-or-restore', foundTarget: true, bridgeMethodCalled: maximizeOrRestoreCalled }
    }

    const originalMinimize = window.mtNative.window.minimize
    let minimizeCalled = false
    window.mtNative.window.minimize = () => {
      minimizeCalled = true
      return originalMinimize()
    }

    const button = document.querySelector('.frameless-titlebar-minimize')
    if (!button) {
      window.mtNative.window.minimize = originalMinimize
      return { interaction: 'minimize', foundTarget: false, bridgeMethodCalled: false }
    }

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 200))
    window.mtNative.window.minimize = originalMinimize

    return { interaction: 'minimize', foundTarget: true, bridgeMethodCalled: minimizeCalled }
  })
  const isMinimized = await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    return mainWindow ? mainWindow.isMinimized() : false
  })

  await app.close()

  expect(typeof windowState.isFullScreen).toBe('boolean')
  expect(typeof windowState.isMaximized).toBe('boolean')
  expect(bridgeCall.foundTarget).toBeTruthy()
  expect(bridgeCall.bridgeMethodCalled).toBeTruthy()
  if (platform === 'darwin') {
    expect(bridgeCall.interaction).toBe('maximize-or-restore')
  } else {
    expect(bridgeCall.interaction).toBe('minimize')
    expect(isMinimized).toBeTruthy()
  }
})

test('clipboard file path probing is exposed through the preload bridge', async () => {
  const { app, page } = await launchElectron()
  const clipboardFilePath = await page.evaluate(() => window.mtNative.clipboard.readFilePath())

  await app.close()

  expect(typeof clipboardFilePath).toBe('string')
})
