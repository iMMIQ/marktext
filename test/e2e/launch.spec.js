const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test.describe('Check Launch MarkText', async () => {
  let app = null
  let page = null

  test.beforeAll(async () => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('launches with the native bridge available', async () => {
    const title = await page.title()
    const hasBridge = await page.evaluate(() => !!window.mtNative)

    expect(/^MarkText|Untitled-1 - MarkText$/.test(title)).toBeTruthy()
    expect(hasBridge).toBeTruthy()
  })
})
