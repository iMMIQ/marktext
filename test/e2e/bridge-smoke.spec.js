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
    'filesystem',
    'fonts',
    'keyboard',
    'menu',
    'runtime',
    'search',
    'shell',
    'window'
  ])
})

test('renderer runtime info is exposed through the preload bridge', async () => {
  const { app, page } = await launchElectron()
  const runtimeInfo = await page.evaluate(() => window.mtNative.runtime.getInfo())

  await app.close()

  expect(typeof runtimeInfo.platform).toBe('string')
  expect(typeof runtimeInfo.appVersion).toBe('string')
  expect(typeof runtimeInfo.env.windowId).toBe('number')
  expect(typeof runtimeInfo.env.type).toBe('string')
  expect(typeof runtimeInfo.paths.userDataPath).toBe('string')
  expect(typeof runtimeInfo.paths.logPath).toBe('string')
  expect(typeof runtimeInfo.paths.ripgrepBinaryPath).toBe('string')
  expect(typeof runtimeInfo.update.canAutoUpdate).toBe('boolean')
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
      const title = document.querySelector('.title-bar .title')
      if (!title) return { interaction: 'maximize-or-restore', foundTarget: false }

      title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 200))

      return { interaction: 'maximize-or-restore', foundTarget: true }
    }

    const button = document.querySelector('.frameless-titlebar-minimize')
    if (!button) return { interaction: 'minimize', foundTarget: false }

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 200))

    return { interaction: 'minimize', foundTarget: true }
  })
  const isMinimized = await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    return mainWindow ? mainWindow.isMinimized() : false
  })

  await app.close()

  expect(typeof windowState.isFullScreen).toBe('boolean')
  expect(typeof windowState.isMaximized).toBe('boolean')
  expect(bridgeCall.foundTarget).toBeTruthy()
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
